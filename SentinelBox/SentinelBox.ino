#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>

// ==========================================
// SentinelBox — Gateway (ESP32 con MPU6500)
// Recibe por SU UNICO UART temp+corriente del
// HVAC conectado, mide VIBRACION con su propio
// MPU6500, y postea los 6 campos al server.
// Plug & play retrofit: arranca con un HVAC,
// lo desconectas, conectas el otro y el gateway
// lo detecta solo por su unit_id (ver HELLO).
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
// WiFi: se une al hotspot del iPhone.
// iPhone: "Maximizar compatibilidad" ACTIVADO.
//
// Sin librerías extra (solo core ESP32).
// ==========================================

const char* WIFI_SSID = "iPhone de Pedrolib";
const char* WIFI_PASS = "sprocket";

// IP de la laptop en el hotspot (ipconfig/ifconfig).
const char* SERVER_BASE = "http://10.22.232.163:3000/api";

// --- Único UART: el HVAC que esté conectado ---
#define HVAC_RX 26
#define HVAC_TX 27
HardwareSerial Hvac(1);

// --- MPU6500 (vibración medida aquí, en el gateway) ---
#define MPU_ADDR      0x68
#define PWR_MGMT_1    0x6B
#define ACCEL_CONFIG  0x1C
#define ACCEL_XOUT_H  0x3B
#define MPU_SDA 21
#define MPU_SCL 22
bool mpuOk = false;
float gwVib = -1.0; // último RMS medido (-1 = sin sensor)
const unsigned long VIB_INTERVAL = 2000;
unsigned long lastVib = 0;

// Throttle: máximo 1 POST por unidad cada 2 s
const unsigned long MIN_FORWARD_GAP = 2000;
struct UnitSlot { String id; unsigned long last; };
UnitSlot slots[8];
int nSlots = 0;
String lastUnit = ""; // para anunciar en vivo cuando cambias de HVAC

// Contadores de tráfico (para el monitor serial)
unsigned long lastRx = 0;      // última vez que llegó ALGO por UART
unsigned long lastReport = 0;  // último reporte de estado
unsigned long nRx = 0;         // líneas recibidas
unsigned long nTx = 0;         // POSTs enviados
unsigned long nDrop = 0;       // líneas descartadas por throttle


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
  mpuWrite(ACCEL_CONFIG, 0x08); // +-4g
  return true;
}

// -1.0 = lectura inválida
float sampleVibrationRMS() {
  const int samples = 60;
  float sumSquares = 0.0;
  int valid = 0;
  for (int i = 0; i < samples; i++) {
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(ACCEL_XOUT_H);
    if (Wire.endTransmission(false) != 0) { delay(5); continue; }
    Wire.requestFrom(MPU_ADDR, 6);
    if (Wire.available() != 6) { delay(5); continue; }
    int16_t rx = (Wire.read() << 8) | Wire.read();
    int16_t ry = (Wire.read() << 8) | Wire.read();
    int16_t rz = (Wire.read() << 8) | Wire.read();
    float ax = rx / 8192.0, ay = ry / 8192.0, az = rz / 8192.0;
    float v = sqrt(ax * ax + ay * ay + az * az) - 1.0; // quitar gravedad
    sumSquares += v * v;
    valid++;
    delay(5);
  }
  if (valid == 0) return -1.0;
  return sqrt(sumSquares / valid);
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

// Número o null -> JSON. missingOk = si falta la key, manda null.
String numOrNull(const String &line, const char *key) {
  String raw;
  if (!getRaw(line, key, raw) || raw == "null" || raw == "" || raw == "nan" || raw == "NaN")
    return "null";
  return raw;
}

bool throttled(const String &id) {
  for (int i = 0; i < nSlots; i++) {
    if (slots[i].id == id) {
      if (millis() - slots[i].last < MIN_FORWARD_GAP) return true;
      slots[i].last = millis();
      return false;
    }
  }
  if (nSlots < 8) {
    slots[nSlots].id = id;
    slots[nSlots].last = millis();
    nSlots++;
  }
  return false;
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
    lastUnit = hello;
    return;
  }

  // --- Lectura normal: rearma SOLO los 6 campos ---
  String unitId;
  if (!getRaw(s, "unit_id", unitId) || unitId.length() == 0) {
    Serial.println("línea sin unit_id, ignorada");
    return;
  }
  if (unitId != lastUnit) {
    // Cambio de HVAC en vivo (o primer dato sin HELLO)
    Serial.println("==============================");
    Serial.printf("  PLUG & PLAY: %s detectado\n", unitId.c_str());
    Serial.println("==============================");
    lastUnit = unitId;
  }
  if (throttled(unitId)) { nDrop++; return; } // máx 1 POST / 2 s por unidad

  // El HVAC solo manda unit_id/temperature/current.
  // status/health los define este gateway; vibración del MPU local.
  const char* status = "healthy";
  const char* health = "100";

  String json = "{";
  json += "\"unit_id\":\"" + unitId + "\",";
  json += "\"temperature\":" + numOrNull(s, "temperature") + ",";
  json += "\"current\":" + numOrNull(s, "current") + ",";
  // Vibración: la mide ESTE gateway (MPU propio). Si falla,
  // se usa lo que mande el HVAC (normalmente null).
  if (gwVib >= 0) json += "\"vibration\":" + String(gwVib, 2) + ",";
  else json += "\"vibration\":" + numOrNull(s, "vibration") + ",";
  json += "\"status\":\"";
  json += status;
  json += "\",\"health_pct\":";
  json += health;
  json += "}";

  int code = postJson("/readings", json);
  nTx++;
  Serial.println("TX POST /readings:");
  Serial.println(json);
  Serial.printf("  -> HTTP %d\n", code);
}

void drainPort() {
  while (Hvac.available()) {
    String line = Hvac.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) continue;
    lastRx = millis();
    nRx++;
    Serial.print("RX UART: ");
    Serial.println(line);
    handleLine(line);
  }
}

// Cada 10 s: latido con contadores. Si el UART lleva callado,
// casi seguro es cableado (TX->RX cruzado, GND) o baud.
void heartbeat() {
  if (millis() - lastReport < 10000) return;
  lastReport = millis();
  unsigned long silent = (lastRx == 0) ? millis() / 1000 : (millis() - lastRx) / 1000;
  Serial.println("----- SentinelBox -----");
  Serial.printf("RX líneas: %lu | POSTs: %lu | descartadas(throttle 2s): %lu\n", nRx, nTx, nDrop);
  Serial.printf("WiFi: %s | MPU: %s | último unit: %s\n",
    WiFi.status() == WL_CONNECTED ? "OK" : "CAIDO",
    mpuOk ? "OK" : "sin sensor",
    lastUnit.length() ? lastUnit.c_str() : "(ninguno)");
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
  Serial.println("=== SentinelBox Gateway ===");

  Hvac.begin(115200, SERIAL_8N1, HVAC_RX, HVAC_TX);
  Serial.println("UART listo @115200 (un solo puerto para el HVAC de turno)");

  Wire.begin(MPU_SDA, MPU_SCL);
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
    Serial.println("Sin WiFi (se siguen leyendo UARTs, POST al reconectar).");
  }
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(2000);
  }
  // Muestreo de vibración cada 2 s (se anexa a los POST)
  if (mpuOk && millis() - lastVib >= VIB_INTERVAL) {
    lastVib = millis();
    float v = sampleVibrationRMS();
    if (v >= 0) {
      gwVib = v;
      Serial.print("Vib local RMS: ");
      Serial.print(gwVib, 5);
      Serial.println(" g");
    }
  }
  drainPort();
  heartbeat();
  delay(20);
}
