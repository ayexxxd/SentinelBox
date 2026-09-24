// ==========================================
// SentinelBox — Unidad HVAC (ESP32) con red neuronal embebida
//
// Cada 2 s: 100 muestras del MPU6500 a 50 Hz, corriente (INA219) y temperatura
// (MAX6675). Las primeras LEARN_WINDOWS lecturas aprenden el baseline de esta unidad;
// después la red (sentinel_model.h) calcula la salud comparando contra ese baseline
// y se manda POST al server Next.js en la laptop. Sin internet funciona igual (LAN).
//
// WiFi y server: copia secrets.example.h a secrets.h y edítalo.
// iPhone: Ajustes > Hotspot personal > "Maximizar compatibilidad" ACTIVADO
// (el ESP32 solo ve redes 2.4 GHz).
//
// Librerías: "Adafruit INA219", "MAX6675 library" (Adafruit).
// Monitor serie (115200): r = reaprender baseline; n / p / c = marcar real_condition
// como NORMAL / PERTURBATION / quitar (para medir los KPIs).
// ==========================================

#include <Adafruit_INA219.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include <Wire.h>
#include <max6675.h>

#include "secrets.h"
#include "sentinel_ann.h"

#define UNIT_ID "HVAC-01"

// --- MPU6500 (vibración) ---
#define MPU_ADDR 0x68
#define SDA_PIN 21
#define SCL_PIN 22
const float ACCEL_LSB_PER_G = 8192.0f;  // ±4 g

// Velocidad del ventilador: convierte la aceleración RMS a velocidad RMS (mm/s)
// suponiendo que domina la vibración a 1x la rotación (desbalance).
const float FAN_RPM = 2000.0f;

// --- Sensores aún sin cablear: se simulan (la red los toma como en baseline) ---
#define MAX6675_WIRED 0  // 1 cuando el termopar esté conectado
const int PIN_TC_SCK = 18, PIN_TC_CS = 5, PIN_TC_SO = 19;
const float SIM_TEMPERATURE_C = 24.6f;
const float SIM_CURRENT_A = 0.321f;

// --- LEDs ---
const int PIN_LED_GREEN = 25;
const int PIN_LED_ORANGE = 26;

const int LEARN_WINDOWS = 45;                    // 90 s de operación normal
const int PERSIST_HITS = 3, PERSIST_WINDOW = 5;  // 3 de las últimas 5 lecturas
const float HEALTH_EMA = 0.35f;                  // suavizado de health_pct en el tiempo

const uint32_t SAMPLE_US = 1000000 / 50;  // 50 Hz, igual que los datos de entrenamiento

Adafruit_INA219 ina219;
MAX6675 thermocouple(PIN_TC_SCK, PIN_TC_CS, PIN_TC_SO);
Preferences prefs;

bool mpuOk = false, inaOk = false;
float acc[SENTINEL_WINDOW][3];
sentinel_obs_t baseline, learnSum;
int learned = 0;  // ventanas acumuladas; >= LEARN_WINDOWS cuando el baseline está listo
bool history[PERSIST_WINDOW];
int historyPos = 0;
float healthSmooth = NAN;
const char *realCondition = nullptr;


// ==========================================
// Sensores
// ==========================================

void writeRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(value);
  Wire.endTransmission();
}

bool initMPU6500() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x75);  // WHO_AM_I
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 1);
  if (!Wire.available()) return false;
  uint8_t id = Wire.read();
  Serial.printf("WHO_AM_I: 0x%02X\n", id);
  if (id != 0x70) return false;
  writeRegister(0x6B, 0x00);  // PWR_MGMT_1: despertar
  delay(100);
  writeRegister(0x1C, 0x08);  // ACCEL_CONFIG: ±4 g
  writeRegister(0x1D, 0x00);  // ACCEL_CONFIG2: DLPF 218 Hz (como los datos de entrenamiento)
  return true;
}

bool readAcceleration(float out[3]) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);  // ACCEL_XOUT_H
  if (Wire.endTransmission(false) != 0) return false;
  Wire.requestFrom(MPU_ADDR, 6);
  if (Wire.available() != 6) return false;
  for (int a = 0; a < 3; a++) {
    int16_t raw = (Wire.read() << 8) | Wire.read();
    out[a] = raw / ACCEL_LSB_PER_G;
  }
  return true;
}

// Llena una ventana de 2 s. La corriente se promedia en todas las muestras; el
// MAX6675 necesita ~220 ms por conversión, así que se lee cada 15 muestras (300 ms).
// Devuelve false si el MPU dejó de responder (vibration = null).
bool acquire(sentinel_obs_t *obs) {
  float curSum = 0, tempSum = 0;
  int tempN = 0, accOk = 0;
  uint32_t next = micros();
  for (int i = 0; i < SENTINEL_WINDOW; i++) {
    while ((int32_t)(micros() - next) < 0) {}
    next += SAMPLE_US;
    if (mpuOk && readAcceleration(acc[i])) accOk++;
    curSum += inaOk ? ina219.getCurrent_mA() / 1000.0f : SIM_CURRENT_A;
#if MAX6675_WIRED
    if (i % 15 == 0) {
      float t = thermocouple.readCelsius();
      if (!isnan(t)) {
        tempSum += t;
        tempN++;
      }
    }
#endif
  }
  sentinel_vibration_stats(acc, SENTINEL_WINDOW, obs);
  obs->current = curSum / SENTINEL_WINDOW;
  obs->temp = MAX6675_WIRED ? (tempN ? tempSum / tempN : NAN) : SIM_TEMPERATURE_C;
  return accOk == SENTINEL_WINDOW;
}

float toMmPerS(float rmsG) { return rmsG * 9806.65f / (2.0f * PI * FAN_RPM / 60.0f); }


// ==========================================
// Baseline
// ==========================================

void startLearning() {
  learned = 0;
  memset(&learnSum, 0, sizeof(learnSum));
  memset(history, 0, sizeof(history));
  healthSmooth = NAN;
  Serial.println("Aprendiendo baseline...");
}

void loadBaseline() {
  prefs.begin("sentinel", true);
  if (prefs.getBytesLength("base") == sizeof(baseline)) {
    prefs.getBytes("base", &baseline, sizeof(baseline));
    learned = LEARN_WINDOWS;
    Serial.println("Baseline cargado de memoria (manda 'r' para reaprender)");
  }
  prefs.end();
}

void learn(const sentinel_obs_t &o) {
  learnSum.vib_rms += o.vib_rms;
  learnSum.vib_crest += o.vib_crest;
  learnSum.vib_kurt += o.vib_kurt;
  learnSum.current += o.current;
  learnSum.temp += o.temp;
  if (++learned < LEARN_WINDOWS) return;
  baseline.vib_rms = learnSum.vib_rms / LEARN_WINDOWS;
  baseline.vib_crest = learnSum.vib_crest / LEARN_WINDOWS;
  baseline.vib_kurt = learnSum.vib_kurt / LEARN_WINDOWS;
  baseline.current = learnSum.current / LEARN_WINDOWS;
  baseline.temp = learnSum.temp / LEARN_WINDOWS;
  prefs.begin("sentinel", false);
  prefs.putBytes("base", &baseline, sizeof(baseline));
  prefs.end();
  Serial.printf("Baseline: vib %.2f mm/s, crest %.2f, kurt %.2f, %.3f A, %.1f C\n", toMmPerS(baseline.vib_rms),
                baseline.vib_crest, baseline.vib_kurt, baseline.current, baseline.temp);
}


// ==========================================
// POST
// ==========================================

int postJson(const String &path, const String &json) {
  HTTPClient http;
  http.begin(String(SERVER_BASE) + path);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);
  int code = http.POST(json);
  Serial.printf("POST %s -> HTTP %d\n", path.c_str(), code);
  http.end();
  return code;
}

String num(float v, int decimals) { return isnan(v) ? String("null") : String(v, decimals); }

void sendUnitInfo() {
  String json = "{";
  json += "\"unit_id\":\"" + String(UNIT_ID) + "\",";
  json += "\"chip\":\"" + String(ESP.getChipModel()) + "\",";
  json += "\"ram_used_kb\":" + String((ESP.getHeapSize() - ESP.getFreeHeap()) / 1024.0, 1) + ",";
  json += "\"ram_total_kb\":" + String(ESP.getHeapSize() / 1024.0, 1) + ",";
  json += "\"flash_used_kb\":" + String(ESP.getSketchSize() / 1024.0, 1) + ",";
  json += "\"flash_total_kb\":" + String(ESP.getFlashChipSize() / 1024.0, 1);
  json += "}";
  postJson("/units", json);
}


// ==========================================
// Salida
// ==========================================

void setLeds(bool learning, bool maintenance) {
  if (learning) {
    digitalWrite(PIN_LED_GREEN, (millis() / 250) % 2);
    digitalWrite(PIN_LED_ORANGE, LOW);
    return;
  }
  digitalWrite(PIN_LED_GREEN, !maintenance);
  digitalWrite(PIN_LED_ORANGE, maintenance);
}

void handleSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == 'r') startLearning();
    if (c == 'n') realCondition = "NORMAL";
    if (c == 'p') realCondition = "PERTURBATION";
    if (c == 'c') realCondition = nullptr;
  }
}


// ==========================================
// SETUP / LOOP
// ==========================================

void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println("=== SentinelBox " + String(UNIT_ID) + " ===");
  pinMode(PIN_LED_GREEN, OUTPUT);
  pinMode(PIN_LED_ORANGE, OUTPUT);

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);
  mpuOk = initMPU6500();
  Serial.println(mpuOk ? "MPU6500 OK" : "MPU6500 no encontrado (vibration=null)");
  inaOk = ina219.begin();
  Serial.println(inaOk ? "INA219 OK" : "INA219 no encontrado (corriente simulada)");
  if (!MAX6675_WIRED) Serial.println("MAX6675 sin cablear (temperatura simulada)");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.printf("Uniendose a %s", WIFI_SSID);
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("IP del ESP: %s\n", WiFi.localIP().toString().c_str());
    sendUnitInfo();
  } else {
    Serial.println("Sin WiFi. Revisa SSID/pass y Maximizar compatibilidad.");
  }

  startLearning();
  loadBaseline();
}

void loop() {
  handleSerial();
  if (WiFi.status() != WL_CONNECTED) WiFi.reconnect();  // la IA sigue corriendo sin WiFi

  sentinel_obs_t obs;
  bool vibOk = acquire(&obs);
  bool learning = learned < LEARN_WINDOWS;

  String json = "{\"unit_id\":\"" + String(UNIT_ID) + "\"";
  json += ",\"temperature\":" + num(obs.temp, 2);
  json += ",\"current\":" + num(obs.current, 4);
  json += ",\"vibration\":" + (vibOk ? num(toMmPerS(obs.vib_rms), 3) : String("null"));
  if (realCondition) json += ",\"real_condition\":\"" + String(realCondition) + "\"";

  if (learning) {
    // Solo ventanas completas (sin MPU se aprende igual; la vibración no aportará).
    if ((vibOk || !mpuOk) && !isnan(obs.temp)) learn(obs);
    setLeds(true, false);
    json += ",\"sentinel_status\":\"LEARNING\"}";
  } else {
    // Un sensor caído no aporta: la red lo ve en su baseline.
    sentinel_obs_t in = obs;
    if (!vibOk) in.vib_rms = baseline.vib_rms, in.vib_crest = baseline.vib_crest, in.vib_kurt = baseline.vib_kurt;
    if (isnan(in.temp)) in.temp = baseline.temp;

    uint32_t t0 = micros();
    sentinel_result_t r;
    sentinel_evaluate(&in, &baseline, &r);
    float processingMs = (micros() - t0) / 1000.0f;

    healthSmooth = isnan(healthSmooth) ? r.health_pct : healthSmooth + HEALTH_EMA * (r.health_pct - healthSmooth);
    history[historyPos] = r.cls == 2;
    historyPos = (historyPos + 1) % PERSIST_WINDOW;
    int hits = 0;
    for (bool h : history) hits += h;
    bool maintenance = hits >= PERSIST_HITS;
    setLeds(false, maintenance);

    json += ",\"baseline_temperature\":" + num(baseline.temp, 2);
    json += ",\"baseline_current\":" + num(baseline.current, 4);
    json += ",\"baseline_vibration\":" + num(toMmPerS(baseline.vib_rms), 3);
    json += ",\"temp_score\":" + num(r.temp_score, 1);
    json += ",\"current_score\":" + num(r.current_score, 1);
    json += ",\"vibration_score\":" + num(r.vibration_score, 1);
    json += ",\"health_pct\":" + num(healthSmooth, 1);
    json += ",\"sentinel_status\":\"" + String(maintenance ? "MAINTENANCE REQUIRED" : "NORMAL") + "\"";
    json += ",\"processing_ms\":" + num(processingMs, 3) + "}";
  }

  Serial.println(json);
  if (WiFi.status() == WL_CONNECTED) postJson("/readings", json);
}
