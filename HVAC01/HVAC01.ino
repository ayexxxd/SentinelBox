#include <Wire.h>
#include <Adafruit_INA219.h>
#include <max6675.h>

// ==========================================
// HVAC-01 — Aire CON PWM fijo al 10%
// (gemelo del HVAC02: mismos sensores y formato,
//  pero este ventilador va siempre al 10% mientras
//  el 02 va al 100%: dos "modelos" con distinto
//  perfil de corriente)
// INA219 + MAX6675 + PWM fijo, manda los datos por
// UART1 al SentinelBox. Plug & play: solo
// conecta TX->RX, RX->TX y GND.
//
// Cableado link UART1 (al único puerto del SentinelBox):
//   HVAC-01 TX (GPIO27) -> SentinelBox RX (GPIO26)
//   HVAC-01 RX (GPIO26) -> SentinelBox TX (GPIO27)
//   GND -> GND
// Baud: 115200
//
// Librerías: Adafruit INA219, max6675
// ==========================================

#define UNIT_ID "HVAC-01"

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

// --- PWM del ventilador ---
#define FAN_PWM   3        // GPIO al gate (vía 100 ohm)
#define PWM_CH    0        // canal LEDC (solo se usa en core 2.x)
#define PWM_FREQ  25000    // 25 kHz: fuera del rango audible
#define PWM_RES   8        // 8 bits: duty de 0 a 255

// --- Promediado del INA219 ---
#define N_MUESTRAS 16      // el ventilador brushless consume corriente pulsante

// --- Umbrales de falla (ajústalos tras ver la corriente normal) ---
#define I_MIN_mA   20.0    // por debajo: ventilador desconectado o detenido
#define I_MAX_mA   350.0   // por encima: sobrecarga o rotor bloqueado
#define T_MAX_C    60.0    // por encima: sobretemperatura

Adafruit_INA219 ina1(0x40);
MAX6675 termopar(TC_SCK, TC_CS, TC_SO);  // orden: SCK, CS, SO

bool inaOk = false;
const int velocidad_pct = 10;  // FIJO: este modelo va siempre al 10%

float energia_Wh = 0.0;        // energía acumulada desde el arranque
unsigned long t_anterior = 0;  // para integrar la potencia en el tiempo

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

// Línea JSON compacta al SentinelBox (una por ciclo).
// SOLO lo que mide este HVAC: ID, temperatura y corriente.
// status/health/vibración los pone el SentinelBox.
void sendLine(float tempC, float currentA) {
  String json = "{";
  json += "\"unit_id\":\"" + String(UNIT_ID) + "\",";
  if (isnan(tempC)) json += "\"temperature\":null,";
  else json += "\"temperature\":" + String(tempC, 2) + ",";
  if (!inaOk) json += "\"current\":null";
  else json += "\"current\":" + String(currentA, 3);
  json += "}";
  LinkSerial.println(json);
  Serial.print("LINK> "); // eco a USB: lo que sale por UART1
  Serial.println(json);
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

  Serial.println("Aire 1 listo: INA219 + MAX6675 + PWM 10% fijo -> UART1");
  t_anterior = millis();
}

void loop() {
  // --- Promediar lecturas del INA219 ---
  float suma_shunt = 0, suma_bus = 0, suma_I = 0, suma_P = 0;
  if (inaOk) {
    for (int i = 0; i < N_MUESTRAS; i++) {
      suma_shunt += ina1.getShuntVoltage_mV();
      suma_bus   += ina1.getBusVoltage_V();
      suma_I     += ina1.getCurrent_mA();
      suma_P     += ina1.getPower_mW();
      delay(2);  // > 532 us: tiempo de conversión del INA219 a 12 bits
    }
  }
  float shunt_mV   = inaOk ? suma_shunt / N_MUESTRAS : 0;
  float bus_V      = inaOk ? suma_bus / N_MUESTRAS : 0;   // voltaje que llega al ventilador
  float current_mA = inaOk ? suma_I / N_MUESTRAS : 0;     // corriente del ventilador
  float power_mW   = inaOk ? suma_P / N_MUESTRAS : 0;     // potencia del ventilador
  float fuente_V   = bus_V + shunt_mV / 1000.0;           // voltaje de la fuente (Vin+)
  float currentA   = current_mA / 1000.0;
  if (currentA < 0) currentA = 0; // ruido del ADC

  // --- Energía acumulada: E += P * dt ---
  unsigned long t_ahora = millis();
  float dt_h = (t_ahora - t_anterior) / 3600000.0;  // ms -> horas
  energia_Wh += (power_mW / 1000.0) * dt_h;         // mW -> W, luego W*h
  t_anterior = t_ahora;

  // --- Temperatura ---
  float temp_C = termopar.readCelsius();  // NaN si el termopar está desconectado

  // --- Detección de fallas (umbrales de su código) ---
  bool fault = false;
  String tags = "";
  if (isnan(temp_C))              { tags += "  [FALLA: sensor de temperatura desconectado]"; fault = true; }
  if (!inaOk)                     { tags += "  [FALLA: INA219 desconectado]"; fault = true; }
  else {
    if (current_mA < I_MIN_mA)    { tags += "  [FALLA: aire apagado o detenido]"; fault = true; }
    if (current_mA > I_MAX_mA)    { tags += "  [FALLA: sobrecarga / rotor bloqueado]"; fault = true; }
  }
  if (!isnan(temp_C) && temp_C > T_MAX_C) { tags += "  [ALERTA: sobretemperatura]"; fault = true; }

  // --- Imprimir mediciones (USB) ---
  Serial.print("PWM: ");        Serial.print(velocidad_pct);    Serial.print(" % | ");
  Serial.print("Fuente: ");     Serial.print(fuente_V, 3);      Serial.print(" V | ");
  Serial.print("Aire: ");       Serial.print(bus_V, 3);         Serial.print(" V | ");
  Serial.print("Corriente: ");  Serial.print(current_mA, 1);    Serial.print(" mA | ");
  Serial.print("Potencia: ");   Serial.print(power_mW, 1);      Serial.print(" mW | ");
  Serial.print("Energía: ");    Serial.print(energia_Wh * 1000.0, 3); Serial.print(" mWh | ");
  Serial.print("Temp: ");
  if (isnan(temp_C)) Serial.print("---");
  else { Serial.print(temp_C, 2); Serial.print(" C"); }
  Serial.print(tags);
  Serial.println();

  // --- Línea de datos al SentinelBox ---
  sendLine(temp_C, currentA);

  delay(270);  // ~300 ms por ciclo (>= 250 ms para el MAX6675)
}
