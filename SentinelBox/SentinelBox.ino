#include <WiFi.h>
#include <HTTPClient.h>

// ==========================================
// SentinelBox — Gateway (ESP32 sin sensores)
// Recibe por SU UNICO UART las líneas JSON del
// HVAC conectado y les hace POST al server.
// Plug & play retrofit: arranca con un HVAC,
// lo desconectas, conectas el otro y el gateway
// lo detecta solo por su unit_id (ver HELLO).
//
// Cableado (un solo puerto):
//   HVAC TX (GPIO17) -> este RX (GPIO16)
//   HVAC RX (GPIO16) -> este TX (GPIO17)
//   GND común.
// Baud: 115200.
//
// WiFi: se une al hotspot del iPhone.
// iPhone: "Maximizar compatibilidad" ACTIVADO.
//
// Sin librerías extra (solo core ESP32).
// ==========================================

const char* WIFI_SSID = "iPhone de ...";
const char* WIFI_PASS = "password...";

// IP de la laptop en el hotspot (ipconfig/ifconfig).
const char* SERVER_BASE = "http://10.22.232.163:3000/api";

// --- Único UART: el HVAC que esté conectado ---
#define HVAC_RX 16
#define HVAC_TX 17
HardwareSerial Hvac(1);

// Throttle: máximo 1 POST por unidad cada 2 s
const unsigned long MIN_FORWARD_GAP = 2000;
struct UnitSlot { String id; unsigned long last; };
UnitSlot slots[8];
int nSlots = 0;
String lastUnit = ""; // para anunciar en vivo cuando cambias de HVAC


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
  if (throttled(unitId)) return; // máx 1 POST / 2 s por unidad

  String status;
  if (!getRaw(s, "status", status) || status.length() == 0) status = "healthy";
  String health;
  if (!getRaw(s, "health_pct", health) || health == "null" || health == "") health = "100";

  String json = "{";
  json += "\"unit_id\":\"" + unitId + "\",";
  json += "\"temperature\":" + numOrNull(s, "temperature") + ",";
  json += "\"current\":" + numOrNull(s, "current") + ",";
  json += "\"vibration\":" + numOrNull(s, "vibration") + ",";
  json += "\"status\":\"" + status + "\",";
  json += "\"health_pct\":" + health;
  json += "}";

  int code = postJson("/readings", json);
  Serial.printf("%s -> /readings HTTP %d\n", unitId.c_str(), code);
}

void drainPort() {
  while (Hvac.available()) {
    String line = Hvac.readStringUntil('\n');
    handleLine(line);
  }
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
  drainPort();
  delay(20);
}
