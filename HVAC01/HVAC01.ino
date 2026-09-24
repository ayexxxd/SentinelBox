#include <Wire.h>
#include <Adafruit_INA219.h>
#include <max6675.h>

// ==========================================
// HVAC-01 — Aire con PWM (nodo UART)
// Lee INA219 + MAX6675 y manda los datos por
// UART1 al SentinelBox. Plug & play: solo
// conecta TX->RX, RX->TX y GND.
//
// Cableado link UART1 (al único puerto del SentinelBox):
//   HVAC-01 TX (GPIO17) -> SentinelBox RX (GPIO16)
//   HVAC-01 RX (GPIO16) -> SentinelBox TX (GPIO17)
//   GND -> GND
// Baud: 115200
//
// Librerías: Adafruit INA219, max6675
// ==========================================

#define UNIT_ID "HVAC-01"

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

// --- PWM del ventilador ---
#define FAN_PWM   3        // GPIO al gate (vía 100 ohm)
#define PWM_CH    0        // canal LEDC (solo se usa en core 2.x)
#define PWM_FREQ  25000    // 25 kHz: fuera del rango audible
#define PWM_RES   8        // 8 bits: duty de 0 a 255

// --- Promediado del INA219 ---
#define N_MUESTRAS 16      // lecturas a promediar por ciclo

Adafruit_INA219 ina1(0x40);
MAX6675 termopar(TC_SCK, TC_CS, TC_SO);  // orden: SCK, CS, SO

bool inaOk = false;
int velocidad_pct = 100;   // velocidad inicial (%)

String status = "healthy";
float healthPct = 96.2;

// Escribe el duty según la versión del core ESP32
void setFan(int pct) {
  pct = constrain(pct, 0, 100);
  int duty = map(pct, 0, 100, 0, (1 << PWM_RES) - 1);
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcWrite(FAN_PWM, duty);   // core 3.x: se escribe por pin
#else
  ledcWrite(PWM_CH, duty);    // core 2.x: se escribe por canal
#endif
}

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

  // Configurar PWM (sintaxis distinta según versión del core)
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcAttach(FAN_PWM, PWM_FREQ, PWM_RES);
#else
  ledcSetup(PWM_CH, PWM_FREQ, PWM_RES);
  ledcAttachPin(FAN_PWM, PWM_CH);
#endif
  setFan(velocidad_pct);

  Wire.begin(I2C_SDA, I2C_SCL);  // iniciar I2C ANTES que el INA219

  inaOk = ina1.begin();
  if (!inaOk) {
    Serial.println("INA219 no encontrado en 0x40 (current=null)");
  } else {
    // Mejor resolución si el ventilador consume < 400 mA.
    // Si consume más, comenta esta línea (queda la calibración 32V/2A).
    ina1.setCalibration_16V_400mA();
  }

  delay(500);  // primera conversión del MAX6675

  sendHello(); // presentarse al SentinelBox

  Serial.println("Aire 1 listo: INA219 + MAX6675 + PWM -> UART1");
  Serial.println("Escribe 0-100 y Enter para cambiar la velocidad (%)");
}

void loop() {
  // --- Leer velocidad desde el Monitor Serie (USB) ---
  if (Serial.available()) {
    String entrada = Serial.readStringUntil('\n');
    entrada.trim();
    if (entrada.length() > 0) {
      velocidad_pct = constrain(entrada.toInt(), 0, 100);
      setFan(velocidad_pct);
      Serial.print(">> Velocidad fijada en ");
      Serial.print(velocidad_pct);
      Serial.println(" %");
    }
  }

  // --- Promediar lecturas del INA219 (corriente pulsada por el PWM) ---
  float suma_bus = 0, suma_I = 0;
  if (inaOk) {
    for (int i = 0; i < N_MUESTRAS; i++) {
      suma_bus += ina1.getBusVoltage_V();
      suma_I   += ina1.getCurrent_mA();
      delay(2);  // > 532 us: tiempo de conversión del INA219 a 12 bits
    }
  }
  float bus_V      = inaOk ? suma_bus / N_MUESTRAS : 0;
  float current_mA = inaOk ? suma_I / N_MUESTRAS : 0;
  float currentA   = current_mA / 1000.0;
  if (currentA < 0) currentA = 0; // ruido del ADC

  // --- Temperatura ---
  float temp_C = termopar.readCelsius();        // NaN si el termopar está desconectado

  // --- Log humano por USB ---
  Serial.print("PWM: ");        Serial.print(velocidad_pct);    Serial.print(" % | ");
  if (inaOk) {
    Serial.print("Fuente: ");     Serial.print(bus_V, 3);         Serial.print(" V | ");
    Serial.print("Corriente: ");  Serial.print(current_mA, 1);    Serial.print(" mA | ");
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

  delay(270);  // ~300 ms por ciclo en total (>= 250 ms para el MAX6675)
}
