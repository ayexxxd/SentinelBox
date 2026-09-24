#include <Wire.h>
#include <Adafruit_INA219.h>
#include <max6675.h>

// ==========================================
// HVAC-02 — Aire SIN PWM (nodo UART)
// Lee INA219 + MAX6675 y manda Corriente,
// Temperatura e ID por UART1 al SentinelBox.
// Plug & play: solo conecta TX->RX, RX->TX y GND.
//
// Cableado link UART1 (al único puerto del SentinelBox):
//   HVAC-02 TX (GPIO27) -> SentinelBox RX (GPIO26)
//   HVAC-02 RX (GPIO26) -> SentinelBox TX (GPIO27)
//   GND -> GND
// Baud: 115200
//
// Librerías: Adafruit INA219, max6675
// ==========================================

#define UNIT_ID "HVAC-02"

// --- I2C (INA219) ---
#define I2C_SDA 21
#define I2C_SCL 22

// --- SPI por software (MAX6675) ---
#define TC_SCK 18
#define TC_SO  19
#define TC_CS  23

// --- UART1: link de datos al SentinelBox ---
#define LINK_RX 26
#define LINK_TX 27
HardwareSerial LinkSerial(1);

// --- Promediado del INA219 ---
#define N_MUESTRAS 16          // el ventilador brushless consume corriente pulsante

// --- Umbrales de falla (ajústalos tras ver la corriente normal) ---
#define I_MIN_mA   20.0        // por debajo: ventilador desconectado o detenido
#define I_MAX_mA   350.0       // por encima: sobrecarga o rotor bloqueado
#define T_MAX_C    60.0        // por encima: sobretemperatura

Adafruit_INA219 ina1(0x40);
MAX6675 termopar(TC_SCK, TC_CS, TC_SO);  // orden: SCK, CS, SO

float energia_Wh = 0.0;        // energía acumulada desde el arranque
unsigned long t_anterior = 0;  // para integrar la potencia en el tiempo

// Línea JSON compacta al SentinelBox (una por ciclo).
// SOLO lo que mide este HVAC: ID, temperatura y corriente.
// status/health/vibración los pone el SentinelBox.
void sendLine(float tempC, float currentA) {
  String json = "{";
  json += "\"unit_id\":\"" + String(UNIT_ID) + "\",";
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
  String json = "{";
  json += "\"hello\":\"" + String(UNIT_ID) + "\",";
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
  delay(500);

  LinkSerial.begin(115200, SERIAL_8N1, LINK_RX, LINK_TX);

  Wire.begin(I2C_SDA, I2C_SCL);  // iniciar I2C ANTES que el INA219

  if (!ina1.begin()) {
    Serial.println("Error: no se encontró el INA219 en 0x40");
    while (1) { delay(10); }
  }

  // Mejor resolución si el ventilador consume < 400 mA.
  // Si consume más, comenta esta línea (queda la calibración 32V/2A).
  ina1.setCalibration_16V_400mA();

  delay(500);  // primera conversión del MAX6675

  sendHello(); // presentarse al SentinelBox

  Serial.println("Aire 2 listo: INA219 + MAX6675 -> UART1");
  t_anterior = millis();
}

void loop() {
  // --- Promediar lecturas del INA219 ---
  float suma_shunt = 0, suma_bus = 0, suma_I = 0, suma_P = 0;
  for (int i = 0; i < N_MUESTRAS; i++) {
    suma_shunt += ina1.getShuntVoltage_mV();
    suma_bus   += ina1.getBusVoltage_V();
    suma_I     += ina1.getCurrent_mA();
    suma_P     += ina1.getPower_mW();
    delay(2);  // > 532 us: tiempo de conversión del INA219 a 12 bits
  }
  float shunt_mV   = suma_shunt / N_MUESTRAS;
  float bus_V      = suma_bus   / N_MUESTRAS;   // voltaje que llega al ventilador
  float current_mA = suma_I     / N_MUESTRAS;   // corriente del ventilador
  float power_mW   = suma_P     / N_MUESTRAS;   // potencia del ventilador
  float fuente_V   = bus_V + shunt_mV / 1000.0; // voltaje de la fuente (Vin+)
  float currentA   = current_mA / 1000.0;
  if (currentA < 0) currentA = 0; // ruido del ADC

  // --- Energía acumulada: E += P * dt ---
  unsigned long t_ahora = millis();
  float dt_h = (t_ahora - t_anterior) / 3600000.0;  // ms -> horas
  energia_Wh += (power_mW / 1000.0) * dt_h;         // mW -> W, luego W*h
  t_anterior = t_ahora;

  // --- Temperatura ---
  float temp_C = termopar.readCelsius();  // NaN si el termopar está desconectado

  // --- Imprimir mediciones ---
  Serial.print("Fuente: ");      Serial.print(fuente_V, 3);    Serial.print(" V | ");
  Serial.print("Aire: ");        Serial.print(bus_V, 3);       Serial.print(" V | ");
  Serial.print("Corriente: ");   Serial.print(current_mA, 1);  Serial.print(" mA | ");
  Serial.print("Potencia: ");    Serial.print(power_mW, 1);    Serial.print(" mW | ");
  Serial.print("Energía: ");     Serial.print(energia_Wh * 1000.0, 3); Serial.print(" mWh | ");
  Serial.print("Temp: ");
  if (isnan(temp_C)) Serial.print("---");
  else { Serial.print(temp_C, 2); Serial.print(" C"); }

  // --- Detección de fallas ---
  if (isnan(temp_C))              Serial.print("  [FALLA: sensor de temperatura desconectado]");
  if (current_mA < I_MIN_mA)      Serial.print("  [FALLA: aire apagado o detenido]");
  if (current_mA > I_MAX_mA)      Serial.print("  [FALLA: sobrecarga / rotor bloqueado]");
  if (!isnan(temp_C) && temp_C > T_MAX_C) Serial.print("  [ALERTA: sobretemperatura]");
  Serial.println();

  // --- Línea de datos al SentinelBox ---
  sendLine(temp_C, currentA);

  delay(270);  // ~300 ms por ciclo (>= 250 ms para el MAX6675)
}
