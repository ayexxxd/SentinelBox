#include <Wire.h>
#include <Adafruit_INA219.h>
#include <max6675.h>

// ==========================================
// HVAC-02 — Aire SIN PWM (nodo UART)
// Lee INA219 + MAX6675 y manda los datos por
// UART1 al SentinelBox. Plug & play: solo
// conecta TX->RX, RX->TX y GND.
//
// Cableado link UART1 (al único puerto del SentinelBox):
//   HVAC-02 TX (GPIO17) -> SentinelBox RX (GPIO16)
//   HVAC-02 RX (GPIO16) -> SentinelBox TX (GPIO17)
//   GND -> GND
// Baud: 115200
//
// Librerías: Adafruit INA219, max6675
// ==========================================

#define UNIT_ID "HVAC-02"

// --- I2C (INA219) ---
#define I2C_SDA 8
#define I2C_SCL 9

// --- SPI por software (MAX6675) ---
#define TC_SCK 4
#define TC_SO  5
#define TC_CS  7

// --- UART1: link de datos al SentinelBox ---
#define LINK_RX 16
#define LINK_TX 17
HardwareSerial LinkSerial(1);

Adafruit_INA219 ina1(0x40);               // dirección por defecto
MAX6675 termopar(TC_SCK, TC_CS, TC_SO);   // orden: SCK, CS, SO

bool inaOk = false;

String status = "healthy";
float healthPct = 96.2;

// Línea JSON compacta al SentinelBox (una por ciclo)
void sendLine(float tempC, float currentA) {
  String json = "{";
  json += "\"unit_id\":\"" + String(UNIT_ID) + "\",";
  if (isnan(tempC)) json += "\"temperature\":null,";
  else json += "\"temperature\":" + String(tempC, 2) + ",";
  if (!inaOk) json += "\"current\":null,";
  else json += "\"current\":" + String(currentA, 3) + ",";
  json += "\"vibration\":null,";
  json += "\"status\":\"" + status + "\",";
  json += "\"health_pct\":" + String(healthPct, 1);
  json += "}";
  LinkSerial.println(json);
}

void sendHello() {
  String json = "{";
  json += "\"hello\":\"" + String(UNIT_ID) + "\",";
  json += "\"chip\":\"" + String(ESP.getChipModel()) + "\",";
  json += "\"ram_kb\":" + String(ESP.getHeapSize() / 1024.0, 1) + ",";
  json += "\"flash_kb\":" + String(ESP.getFlashChipSize() / 1024.0, 1);
  json += "}";
  LinkSerial.println(json);
}

void setup() {
  Serial.begin(115200);
  delay(1000);  // tiempo para que el USB CDC enumere

  LinkSerial.begin(115200, SERIAL_8N1, LINK_RX, LINK_TX);

  Wire.begin(I2C_SDA, I2C_SCL);  // iniciar I2C ANTES que el INA219

  inaOk = ina1.begin();
  if (!inaOk) {
    Serial.println("INA219 no encontrado en 0x40 (current=null)");
  } else {
    // Mejor resolución si el ventilador consume < 400 mA.
    // Si consume más, comenta esta línea (queda la calibración 32V/2A).
    ina1.setCalibration_16V_400mA();
  }

  delay(500);  // el MAX6675 necesita tiempo para su primera conversión

  sendHello(); // presentarse al SentinelBox

  Serial.println("Aire 2 listo: INA219 + MAX6675 -> UART1");
}

void loop() {
  // --- Mediciones eléctricas del ventilador ---
  float bus_V = 0, current_mA = 0;
  if (inaOk) {
    bus_V      = ina1.getBusVoltage_V();
    current_mA = ina1.getCurrent_mA();
  }
  float currentA = current_mA / 1000.0;
  if (currentA < 0) currentA = 0; // ruido del ADC

  // --- Temperatura ---
  float temp_C = termopar.readCelsius();         // NaN si el termopar está desconectado

  // --- Log humano por USB ---
  if (inaOk) {
    Serial.print("Ventilador: "); Serial.print(bus_V, 3);      Serial.print(" V | ");
    Serial.print("Corriente: ");  Serial.print(current_mA, 1); Serial.print(" mA | ");
  } else {
    Serial.print("INA219: desconectado | ");
  }
  Serial.print("Temp: ");
  if (isnan(temp_C)) {
    Serial.println("termopar desconectado");
  } else {
    Serial.print(temp_C, 2);
    Serial.println(" C");
  }

  // --- Línea de datos al SentinelBox ---
  sendLine(temp_C, currentA);

  delay(300);  // >= 250 ms para que el MAX6675 complete cada conversión
}
