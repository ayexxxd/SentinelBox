
#include <Wire.h>
#include <Adafruit_INA219.h>
#include <max6675.h>

// --- I2C (INA219) ---
#define I2C_SDA 8
#define I2C_SCL 9

// --- SPI por software (MAX6675) ---
#define TC_SCK 4
#define TC_SO  5
#define TC_CS  7

// --- PWM del ventilador ---
#define FAN_PWM   3        // GPIO al gate (vía 100 ohm)
#define PWM_CH    0        // canal LEDC (solo se usa en core 2.x)
#define PWM_FREQ  25000    // 25 kHz: fuera del rango audible
#define PWM_RES   8        // 8 bits: duty de 0 a 255

// --- Promediado del INA219 ---
#define N_MUESTRAS 16      // lecturas a promediar por ciclo

#define UNIT_ID "HVAC-01"

// --- UART1: link de datos al SentinelBox (SOLO se agregan estos 2 pines) ---
//   HVAC-01 TX (GPIO21) -> SentinelBox RX (GPIO26)
//   HVAC-01 RX (GPIO20) -> SentinelBox TX (GPIO27)
//   GND -> GND. Baud: 115200.
#define LINK_RX 20
#define LINK_TX 21
HardwareSerial LinkSerial(1);

Adafruit_INA219 ina1(0x40);
MAX6675 termopar(TC_SCK, TC_CS, TC_SO);  // orden: SCK, CS, SO

int velocidad_pct = 100;   // velocidad inicial (%)

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

// Línea JSON al SentinelBox: SOLO ID + temperatura + corriente
void sendLine(float tempC, float currentA) {
  String json = "{\"unit_id\":\"" + String(UNIT_ID) + "\",";
  if (isnan(tempC)) json += "\"temperature\":null,";
  else json += "\"temperature\":" + String(tempC, 2) + ",";
  json += "\"current\":" + String(currentA, 3);
  json += "}";
  LinkSerial.println(json);
  Serial.print("LINK> "); // eco a USB: lo que sale por UART1
  Serial.println(json);
}

// HELLO con el ID al arrancar (el SentinelBox registra la unidad)
void sendHello() {
  String json = "{\"hello\":\"" + String(UNIT_ID) + "\",";
  json += "\"chip\":\"" + String(ESP.getChipModel()) + "\",";
  json += "\"ram_kb\":" + String(ESP.getHeapSize() / 1024.0, 1) + ",";
  json += "\"flash_kb\":" + String(ESP.getFlashChipSize() / 1024.0, 1);
  json += "}";
  LinkSerial.println(json);
  Serial.print("LINK> ");
  Serial.println(json);
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

  if (!ina1.begin()) {
    Serial.println("Error: no se encontró el INA219 en 0x40");
    while (1) { delay(10); }
  }

  // Mejor resolución si el ventilador consume < 400 mA.
  // Si consume más, comenta esta línea (queda la calibración 32V/2A).
  ina1.setCalibration_16V_400mA();

  delay(500);  // primera conversión del MAX6675

  Serial.println("Aire 1 listo: INA219 + MAX6675 + PWM");
  Serial.println("Escribe 0-100 y Enter para cambiar la velocidad (%)");
  sendHello(); // presentarse al SentinelBox
}

void loop() {
  // --- Leer velocidad desde el Monitor Serie ---
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
  float suma_shunt = 0, suma_bus = 0, suma_I = 0, suma_P = 0;
  for (int i = 0; i < N_MUESTRAS; i++) {
    suma_shunt += ina1.getShuntVoltage_mV();
    suma_bus   += ina1.getBusVoltage_V();
    suma_I     += ina1.getCurrent_mA();
    suma_P     += ina1.getPower_mW();
    delay(2);  // > 532 us: tiempo de conversión del INA219 a 12 bits
  }
  float shunt_mV   = suma_shunt / N_MUESTRAS;
  float bus_V      = suma_bus   / N_MUESTRAS;   // ahora ~ voltaje de la fuente
  float current_mA = suma_I     / N_MUESTRAS;   // corriente promedio del ventilador
  float power_mW   = suma_P     / N_MUESTRAS;   // potencia promedio

  // --- Temperatura ---
  float temp_C = termopar.readCelsius();        // NaN si el termopar está desconectado

  Serial.print("PWM: ");        Serial.print(velocidad_pct);    Serial.print(" % | ");
  Serial.print("Fuente: ");     Serial.print(bus_V, 3);         Serial.print(" V | ");
  Serial.print("Corriente: ");  Serial.print(current_mA, 1);    Serial.print(" mA | ");
  Serial.print("Potencia: ");   Serial.print(power_mW, 1);      Serial.print(" mW | ");

  Serial.print("Temp: ");
  if (isnan(temp_C)) {
    Serial.println("termopar desconectado");
  } else {
    Serial.print(temp_C, 2);
    Serial.println(" C");
  }

  // --- Línea de datos al SentinelBox ---
  float currentA = current_mA / 1000.0;
  if (currentA < 0) currentA = 0; // ruido del ADC
  sendLine(temp_C, currentA);

  delay(270);  // ~300 ms por ciclo en total (>= 250 ms para el MAX6675)
}