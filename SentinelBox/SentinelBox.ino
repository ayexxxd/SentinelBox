#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Preferences.h>

#include "secrets.h"
#include "sentinel_ann.h"
#include "unit_state.h"

// ==========================================
// SentinelBox — Gateway (ESP32 con MPU6500) + red neuronal embebida
// Recibe por SU UNICO UART temp+corriente del
// HVAC conectado, mide VIBRACION con su propio
// MPU6500, calcula la salud con la red neuronal
// (sentinel_model.h) y postea los 6 campos al server.
// Plug & play retrofit: arranca con un HVAC,
// lo desconectas, conectas el otro y el gateway
// lo detecta solo por su unit_id (ver HELLO).
// Cada HVAC aprende y guarda su propio baseline.
//
// Cada 2 s: 100 muestras del MPU a 50 Hz + promedio de
// lo que mandó el HVAC -> red -> POST /readings.
// Las primeras LEARN_WINDOWS ventanas de cada HVAC
// aprenden su "normal" (status/health = null). Después:
// status healthy / warning / degraded (3 de 5 lecturas), health_pct y
// el "por qué": temp_score, current_score, vibration_score (0-100).
//
// Cableado (un solo puerto UART):
//   HVAC TX (GPIO27) -> este RX (GPIO26)
//   HVAC RX (GPIO26) -> este TX (GPIO27)
//   GND común.
// Baud: 115200.
//
// MPU6500 (vibración, en esta placa):
//   SDA GPIO21, SCL GPIO22, ADDR 0x68.
//
// WiFi: copia secrets.example.h a secrets.h y edítalo.
// iPhone: "Maximizar compatibilidad" ACTIVADO.
//
// Monitor serie (115200): r = reaprender el baseline del HVAC conectado,
// v = ver/ocultar cada línea que llega del HVAC por UART.
// Las líneas "CSV,..." son para armar el dataset real (ml/collect_serial.py).
//
// Sin librerías extra (solo core ESP32).
// ==========================================

// --- Único UART: el HVAC que esté conectado ---
#define HVAC_RX 26
#define HVAC_TX 27
HardwareSerial Hvac(1);

// --- MPU6500 (vibración medida aquí, en el gateway) ---
#define MPU_ADDR      0x68
#define PWR_MGMT_1    0x6B
#define ACCEL_CONFIG  0x1C
#define ACCEL_CONFIG2 0x1D
#define ACCEL_XOUT_H  0x3B
#define MPU_SDA 21
#define MPU_SCL 22
bool mpuOk = false;

// RPM de cada ventilador: convierte la aceleración RMS a velocidad RMS (mm/s)
// suponiendo que domina la vibración a 1x la rotación. Mídanlas y ajústenlas.
float fanRpm(const String &id) {
  if (id == "HVAC-01") return 600.0f;   // PWM fijo 10 %
  if (id == "HVAC-02") return 2000.0f;  // 100 %
  return 1500.0f;
}

// --- Red neuronal ---
const int LEARN_WINDOWS = 45;                    // 90 s de operación normal por HVAC
const int PERSIST_HITS = 3;  // advertencia / mantenimiento: 3 de las últimas PERSIST_WINDOW lecturas
const float HEALTH_EMA = 0.35f;                  // suavizado de health_pct en el tiempo
const uint32_t SAMPLE_US = 1000000 / 50;         // 50 Hz, igual que los datos de entrenamiento
const unsigned long HVAC_TIMEOUT_MS = 3000;      // sin datos del HVAC -> no se postea

const int MAX_UNITS = 8;
UnitState units[MAX_UNITS];
int nUnits = 0;
UnitState *active = nullptr;  // el HVAC conectado ahora
Preferences prefs;

// Ventana en curso (se llena sin bloquear, entre líneas del UART).
float acc[SENTINEL_WINDOW][3];
int nSamples = 0, accOk = 0;
uint32_t nextSample = 0;
float curSum = 0, tempSum = 0;
int curN = 0, tempN = 0;

String lastUnit = ""; // para anunciar en vivo cuando cambias de HVAC

// Contadores de tráfico (para el monitor serial)
unsigned long lastRx = 0;      // última vez que llegó ALGO por UART
unsigned long lastData = 0;    // última lectura válida del HVAC activo
unsigned long lastReport = 0;  // último reporte de estado
unsigned long lastWifiTry = 0;
unsigned long nRx = 0;         // líneas recibidas
unsigned long nTx = 0;         // POSTs enviados
bool echoRx = false;           // 'v' en el monitor serie: ver cada línea que llega del HVAC


// ==========================================
// MPU6500 (vibración del banco, medida aquí)
// ==========================================

void mpuWrite(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(value);
  Wire.endTransmission();
}

bool initMPU() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x75); // WHO_AM_I
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 1);
  if (!Wire.available()) return false;
  if (Wire.read() != 0x70) return false;
  mpuWrite(PWR_MGMT_1, 0x00);
  delay(100);
  mpuWrite(ACCEL_CONFIG, 0x08);  // +-4g
  mpuWrite(ACCEL_CONFIG2, 0x00); // DLPF 218 Hz (como los datos de entrenamiento)
  return true;
}

bool readAccel(float out[3]) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(ACCEL_XOUT_H);
  if (Wire.endTransmission(false) != 0) return false;
  Wire.requestFrom(MPU_ADDR, 6);
  if (Wire.available() != 6) return false;
  for (int a = 0; a < 3; a++) {
    int16_t raw = (Wire.read() << 8) | Wire.read();
    out[a] = raw / 8192.0f;
  }
  return true;
}

float toMmPerS(float rmsG, const String &id) {
  return rmsG * 9806.65f / (2.0f * PI * fanRpm(id) / 60.0f);
}


// ==========================================
// Ventana de 2 s
// ==========================================

void resetWindow() {
  nSamples = accOk = 0;
  curSum = tempSum = 0;
  curN = tempN = 0;
  nextSample = micros();
}

// Toma una muestra del MPU si ya tocan los 20 ms.
void sampleMpu() {
  if (nSamples >= SENTINEL_WINDOW || (int32_t)(micros() - nextSample) < 0) return;
  nextSample += SAMPLE_US;
  if (mpuOk && readAccel(acc[nSamples])) accOk++;
  else acc[nSamples][0] = acc[nSamples][1] = acc[nSamples][2] = 0;
  nSamples++;
}


// ==========================================
// Baseline por HVAC (guardado en NVS)
// ==========================================

String nvsKey(const String &id) { return ("b" + id).substring(0, 15); }

UnitState *unitFor(const String &id) {
  for (int i = 0; i < nUnits; i++)
    if (units[i].id == id) return &units[i];
  UnitState *u = &units[nUnits < MAX_UNITS ? nUnits++ : MAX_UNITS - 1];
  memset(u->history, 0, sizeof(u->history));
  u->id = id;
  u->learned = u->nCur = u->nTemp = u->historyPos = 0;
  memset(&u->learnSum, 0, sizeof(u->learnSum));
  u->healthSmooth = NAN;
  u->scoreSmooth[0] = u->scoreSmooth[1] = u->scoreSmooth[2] = NAN;
  prefs.begin("sentinel", true);
  if (prefs.getBytesLength(nvsKey(id).c_str()) == sizeof(u->baseline)) {
    prefs.getBytes(nvsKey(id).c_str(), &u->baseline, sizeof(u->baseline));
    u->learned = LEARN_WINDOWS;
    Serial.printf("  Baseline de %s cargado de memoria (manda 'r' para reaprender)\n", id.c_str());
  }
  prefs.end();
  return u;
}

void startLearning(UnitState *u) {
  u->learned = u->nCur = u->nTemp = u->historyPos = 0;
  memset(&u->learnSum, 0, sizeof(u->learnSum));
  memset(u->history, 0, sizeof(u->history));
  u->healthSmooth = NAN;
  u->scoreSmooth[0] = u->scoreSmooth[1] = u->scoreSmooth[2] = NAN;
  Serial.printf("Aprendiendo baseline de %s...\n", u->id.c_str());
}

void learn(UnitState *u, const sentinel_obs_t &o) {
  u->learnSum.vib_rms += o.vib_rms;
  u->learnSum.vib_crest += o.vib_crest;
  u->learnSum.vib_kurt += o.vib_kurt;
  if (!isnan(o.current)) u->learnSum.current += o.current, u->nCur++;
  if (!isnan(o.temp)) u->learnSum.temp += o.temp, u->nTemp++;
  if (++u->learned < LEARN_WINDOWS) return;
  sentinel_obs_t &b = u->baseline;
  b.vib_rms = u->learnSum.vib_rms / LEARN_WINDOWS;
  b.vib_crest = u->learnSum.vib_crest / LEARN_WINDOWS;
  b.vib_kurt = u->learnSum.vib_kurt / LEARN_WINDOWS;
  b.current = u->nCur ? u->learnSum.current / u->nCur : NAN;
  b.temp = u->nTemp ? u->learnSum.temp / u->nTemp : NAN;
  prefs.begin("sentinel", false);
  prefs.putBytes(nvsKey(u->id).c_str(), &b, sizeof(b));
  prefs.end();
  Serial.printf("  Baseline %s: vib %.2f mm/s, crest %.2f, kurt %.2f, %.3f A, %.1f C\n", u->id.c_str(),
                toMmPerS(b.vib_rms, u->id), b.vib_crest, b.vib_kurt, b.current, b.temp);
}


// ==========================================
// Mini-parser JSON (formato fijo, sin libs)
// ==========================================

// Extrae el valor crudo de "key": (con o sin comillas) -> out
bool getRaw(const String &line, const char *key, String &out) {
  String pat = String("\"") + key + "\":";
  int i = line.indexOf(pat);
  if (i < 0) return false;
  i += pat.length();
  while (i < (int)line.length() && line[i] == ' ') i++;
  if (i >= (int)line.length()) return false;
  if (line[i] == '"') {
    int j = line.indexOf('"', i + 1);
    if (j < 0) return false;
    out = line.substring(i + 1, j);
    return true;
  }
  int j = i;
  while (j < (int)line.length() && line[j] != ',' && line[j] != '}') j++;
  out = line.substring(i, j);
  out.trim();
  return true;
}

// Número de la línea, o NAN si falta / es null.
float getNum(const String &line, const char *key) {
  String raw;
  if (!getRaw(line, key, raw) || raw == "" || raw == "null" || raw == "nan" || raw == "NaN") return NAN;
  return raw.toFloat();
}

String num(float v, int decimals) { return isnan(v) ? String("null") : String(v, decimals); }


// ==========================================
// POST
// ==========================================

int postJson(const String &path, const String &json) {
  if (WiFi.status() != WL_CONNECTED) return -1;
  HTTPClient http;
  http.begin(String(SERVER_BASE) + path);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);
  int code = http.POST(json);
  http.end();
  return code;
}

void handleLine(const String &line) {
  String s = line;
  s.trim();
  if (s.length() < 10 || s[0] != '{') return; // ignora logs humanos

  // --- HELLO de un HVAC recién conectado ---
  String hello;
  if (getRaw(s, "hello", hello) && hello.length() > 0) {
    String chip, ram, flash;
    getRaw(s, "chip", chip);
    getRaw(s, "ram_kb", ram);
    getRaw(s, "flash_kb", flash);
    String json = "{\"unit_id\":\"" + hello + "\"";
    if (chip.length()) json += ",\"chip\":\"" + chip + "\"";
    if (ram.length() && ram != "null") json += ",\"ram_total_kb\":" + ram;
    if (flash.length() && flash != "null") json += ",\"flash_total_kb\":" + flash;
    json += "}";
    int code = postJson("/units", json);
    Serial.println("==============================");
    Serial.printf("  PLUG & PLAY: %s conectado\n", hello.c_str());
    Serial.printf("  /units HTTP %d\n", code);
    Serial.println("==============================");
    return;
  }

  // --- Lectura normal: se acumula en la ventana en curso ---
  String unitId;
  if (!getRaw(s, "unit_id", unitId) || unitId.length() == 0) {
    Serial.println("línea sin unit_id, ignorada");
    return;
  }
  if (unitId != lastUnit) {
    // Cambio de HVAC en vivo (o primer dato sin HELLO): ventana nueva.
    Serial.println("==============================");
    Serial.printf("  PLUG & PLAY: %s detectado\n", unitId.c_str());
    Serial.println("==============================");
    lastUnit = unitId;
    active = unitFor(unitId);
    resetWindow();
  }
  lastData = millis();
  float c = getNum(s, "current"), t = getNum(s, "temperature");
  if (!isnan(c)) curSum += c, curN++;
  if (!isnan(t)) tempSum += t, tempN++;
}

void drainPort() {
  while (Hvac.available()) {
    String line = Hvac.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) continue;
    lastRx = millis();
    nRx++;
    if (echoRx) Serial.println("RX UART: " + line);
    handleLine(line);
  }
}


// ==========================================
// Red neuronal: una lectura cada ventana
// ==========================================

void processWindow() {
  if (!active || millis() - lastData > HVAC_TIMEOUT_MS) return;  // ningún HVAC conectado
  UnitState &u = *active;

  sentinel_obs_t obs;
  sentinel_vibration_stats(acc, SENTINEL_WINDOW, &obs);
  bool vibOk = accOk == SENTINEL_WINDOW;
  obs.current = curN ? curSum / curN : NAN;
  obs.temp = tempN ? tempSum / tempN : NAN;

  String json = "{";
  json += "\"unit_id\":\"" + u.id + "\",";
  json += "\"temperature\":" + num(obs.temp, 2) + ",";
  json += "\"current\":" + num(obs.current, 4) + ",";
  json += "\"vibration\":" + (vibOk ? num(toMmPerS(obs.vib_rms, u.id), 3) : String("null"));

  if (u.learned < LEARN_WINDOWS) {
    // Solo ventanas con vibración completa (sin MPU se aprende igual; no aportará).
    if (vibOk || !mpuOk) learn(&u, obs);
    json += "}";  // status/health = null mientras aprende
    int code = postJson("/readings", json);
    nTx++;
    Serial.printf("TX %s -> HTTP %d\n", json.c_str(), code);
    Serial.printf("%s aprendiendo %d/%d\n", u.id.c_str(), u.learned, LEARN_WINDOWS);
    return;
  }

  // Un sensor caído (o que nunca reportó) no aporta: la red lo ve en su baseline.
  sentinel_obs_t in = obs, base = u.baseline;
  if (!vibOk) in.vib_rms = base.vib_rms, in.vib_crest = base.vib_crest, in.vib_kurt = base.vib_kurt;
  if (isnan(base.current)) base.current = in.current = 1;
  else if (isnan(in.current)) in.current = base.current;
  if (isnan(base.temp)) base.temp = in.temp = 0;
  else if (isnan(in.temp)) in.temp = base.temp;

  uint32_t t0 = micros();
  sentinel_result_t r;
  sentinel_evaluate(&in, &base, &r);
  float processingMs = (micros() - t0) / 1000.0f;

  auto ema = [](float &s, float v) { s = isnan(s) ? v : s + HEALTH_EMA * (v - s); };
  ema(u.healthSmooth, r.health_pct);
  ema(u.scoreSmooth[0], r.vibration_score);
  ema(u.scoreSmooth[1], r.current_score);
  ema(u.scoreSmooth[2], r.temp_score);
  u.history[u.historyPos] = r.cls;
  u.historyPos = (u.historyPos + 1) % PERSIST_WINDOW;
  int warnHits = 0, maintHits = 0;
  for (uint8_t c : u.history) warnHits += c >= 1, maintHits += c == 2;
  bool maintenance = maintHits >= PERSIST_HITS;
  bool warning = !maintenance && warnHits >= PERSIST_HITS;

  json += ",\"status\":\"" + String(maintenance ? "degraded" : warning ? "warning" : "healthy") + "\"";
  json += ",\"health_pct\":" + num(u.healthSmooth, 1);
  // Por qué: salud que cuesta cada sensor (la red con solo ese sensor desviado).
  json += ",\"vibration_score\":" + num(u.scoreSmooth[0], 1);
  json += ",\"current_score\":" + num(u.scoreSmooth[1], 1);
  json += ",\"temp_score\":" + num(u.scoreSmooth[2], 1) + "}";
  int code = postJson("/readings", json);
  nTx++;
  Serial.printf("TX %s -> HTTP %d\n", json.c_str(), code);

  static const char *CLS[] = {"NORMAL", "WARNING", "MAINTENANCE"};
  Serial.printf("%s salud %.1f%% | red: %s | scores vib %.0f cur %.0f temp %.0f | %s | %.3f ms\n",
                u.id.c_str(), u.healthSmooth, CLS[r.cls], r.vibration_score, r.current_score, r.temp_score,
                maintenance ? "MANTENIMIENTO" : warning ? "ADVERTENCIA" : "ok", processingMs);
  // Features crudas + baseline para armar el dataset real (ml/collect_serial.py).
  Serial.printf("CSV,%lu,%s,%d,%d,%d,%.6f,%.4f,%.4f,%.5f,%.3f,%.6f,%.4f,%.4f,%.5f,%.3f,%d,%.1f\n", millis(),
                u.id.c_str(), vibOk, !isnan(obs.current), !isnan(obs.temp), obs.vib_rms, obs.vib_crest,
                obs.vib_kurt, obs.current, obs.temp, u.baseline.vib_rms, u.baseline.vib_crest, u.baseline.vib_kurt,
                u.baseline.current, u.baseline.temp, r.cls, r.health_pct);
}


// ==========================================
// Monitor serie
// ==========================================

void handleSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == 'v') {
      echoRx = !echoRx;
      Serial.printf("Eco del UART %s\n", echoRx ? "ACTIVADO" : "desactivado");
    }
    if (c == 'r' && active) {
      prefs.begin("sentinel", false);
      prefs.remove(nvsKey(active->id).c_str());
      prefs.end();
      startLearning(active);
    }
  }
}

// Cada 10 s: latido con contadores. Si el UART lleva callado,
// casi seguro es cableado (TX->RX cruzado, GND) o baud.
void heartbeat() {
  if (millis() - lastReport < 10000) return;
  lastReport = millis();
  unsigned long silent = (lastRx == 0) ? millis() / 1000 : (millis() - lastRx) / 1000;
  Serial.println("----- SentinelBox -----");
  Serial.printf("RX líneas: %lu | POSTs: %lu\n", nRx, nTx);
  Serial.printf("WiFi: %s | MPU: %s | último unit: %s\n",
    WiFi.status() == WL_CONNECTED ? "OK" : "CAIDO",
    mpuOk ? "OK" : "sin sensor",
    lastUnit.length() ? lastUnit.c_str() : "(ninguno)");
  if (active) {
    if (active->learned < LEARN_WINDOWS)
      Serial.printf("Red: aprendiendo baseline de %s (%d/%d)\n", active->id.c_str(), active->learned, LEARN_WINDOWS);
    else
      Serial.printf("Red: %s salud %.1f%%\n", active->id.c_str(), active->healthSmooth);
  }
  if (silent > 12) {
    Serial.println("UART EN SILENCIO: revisa TX(HVAC)->RX(26), RX(HVAC)->TX(27), GND y 115200.");
  }
  Serial.println("-----------------------");
}


// ==========================================
// SETUP / LOOP
// ==========================================

void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println("=== SentinelBox Gateway + IA embebida ===");

  Hvac.setRxBufferSize(1024);  // aguanta las líneas que llegan durante un POST
  Hvac.begin(115200, SERIAL_8N1, HVAC_RX, HVAC_TX);
  Serial.println("UART listo @115200 (un solo puerto para el HVAC de turno)");

  Wire.begin(MPU_SDA, MPU_SCL);
  Wire.setClock(400000);
  mpuOk = initMPU();
  Serial.println(mpuOk ? "MPU6500 OK (vibración local)" : "MPU6500 no encontrado (vibration=null)");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Uniendose a ");
  Serial.println(WIFI_SSID);
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("IP del SentinelBox: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("Sin WiFi (la red sigue corriendo, POST al reconectar).");
  }
  resetWindow();
}

void loop() {
  // Reconexión sin bloquear: el muestreo del MPU no se puede detener.
  if (WiFi.status() != WL_CONNECTED && millis() - lastWifiTry > 5000) {
    lastWifiTry = millis();
    WiFi.reconnect();
  }
  drainPort();
  sampleMpu();
  if (nSamples >= SENTINEL_WINDOW) {
    processWindow();  // corre la red y postea (puede tardar por el POST)
    resetWindow();
  }
  handleSerial();
  heartbeat();
}
