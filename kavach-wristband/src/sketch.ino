// =============================================================
//  Project  : Kavach Safety Wristband — Final Firmware
//  Hardware : ESP32 DevKit V1
//             DS18B20  – body temperature  (GPIO 27, 1-Wire)
//             MAX30100 – heart rate + SpO2 (SDA=GPIO21, SCL=GPIO22)
//             SH1106   – 0.96" OLED        (SDA=GPIO21, SCL=GPIO22)
//             Red LED  – alert indicator   (GPIO 26, 1kΩ series)
//             Buzzer   – alert tone        (GPIO 25)
//
//  OLED: SH1106 @ 0x3C — SW I2C (bit-bang), CONFIRMED WORKING
//  MAX30100: HW I2C (Wire) — non-fatal if not found
// =============================================================

#include <Arduino.h>
#include <Wire.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <U8g2lib.h>
#include "MAX30100_PulseOximeter.h"

// ── Pins ─────────────────────────────────────────────────────
#define ONE_WIRE_BUS  27
#define LED_PIN       26
#define BUZZER_PIN    25
// MAX30100 uses HW I2C Wire on GPIO21/22
#define MAX_SDA_PIN   21
#define MAX_SCL_PIN   22
// OLED uses SW I2C on GPIO4/5 — SEPARATE from MAX30100 bus
#define OLED_SDA_PIN   4
#define OLED_SCL_PIN   5

// ── OLED: SW I2C on GPIO4/5 — no conflict with MAX30100 ──────
U8G2_SH1106_128X64_NONAME_F_SW_I2C display(U8G2_R2, /*clk=*/OLED_SCL_PIN, /*data=*/OLED_SDA_PIN, U8X8_PIN_NONE);

// ── Temperature sensor ────────────────────────────────────────
OneWire           oneWire(ONE_WIRE_BUS);
DallasTemperature tempSensor(&oneWire);

// ── MAX30100 (optional — non-fatal if wiring issue) ───────────
PulseOximeter pox;
bool poxReady = false;   // false = sensor missing, show "--" instead

// ── Safe medical ranges ──────────────────────────────────────
const float SAFE_TEMP_MIN = 35.0f;
const float SAFE_TEMP_MAX = 38.0f;
const int   SAFE_HR_MAX   = 120;
const int   SAFE_SPO2_MIN = 92;

// ── Runtime state ────────────────────────────────────────────
#define REPORT_MS 1000
uint32_t lastReportMs = 0;
bool     alertActive  = false;
bool     blinkState   = false;
String   currentAction = "";

void onBeatDetected() {}

// =============================================================
// OLED helpers
// =============================================================
void showSplash() {
  display.clearBuffer();
  display.setFont(u8g2_font_ncenB14_tr);
  display.drawStr(18, 26, "KAVACH");
  display.setFont(u8g2_font_6x10_tr);
  display.drawStr(12, 42, "Medical Monitor");
  display.drawStr(22, 56, "Initialising...");
  display.drawFrame(0, 0, 128, 64);
  display.sendBuffer();
}

void showWarning(const char* line1, const char* line2) {
  display.clearBuffer();
  display.setFont(u8g2_font_6x10_tr);
  display.drawStr(10, 10, "KAVACH SYSTEM");
  display.drawHLine(0, 14, 128);
  display.drawStr(4, 30, line1);
  display.drawStr(4, 44, line2);
  display.sendBuffer();
}

void showVitals(float temp, int hr, int spo2, bool alert, const String& action) {
  display.clearBuffer();

  display.setFont(u8g2_font_6x10_tr);

  // Top bar: T / HR / O2
  char buf[32];
  snprintf(buf, sizeof(buf), "T:%.1fC", temp);
  display.drawStr(0, 9, buf);

  if (hr > 0) {
    snprintf(buf, sizeof(buf), "HR:%d", hr);
  } else {
    snprintf(buf, sizeof(buf), "HR:--");
  }
  display.drawStr(52, 9, buf);

  if (spo2 > 0) {
    snprintf(buf, sizeof(buf), "O2:%d%%", spo2);
  } else {
    snprintf(buf, sizeof(buf), "O2:--");
  }
  display.drawStr(93, 9, buf);

  display.drawHLine(0, 12, 128);

  // Status
  display.setFont(u8g2_font_ncenB14_tr);
  if (alert) {
    display.drawStr(10, 30, "! ALERT !");
  } else {
    display.drawStr(34, 30, "SAFE");
  }

  // Action text (line-wrapped on \n)
  display.drawHLine(0, 34, 128);
  display.setFont(u8g2_font_6x10_tr);
  int lineY = 45, start = 0;
  for (int i = 0; i <= (int)action.length(); i++) {
    if (action[i] == '\n' || action[i] == '\0') {
      String chunk = action.substring(start, i);
      display.drawStr(0, lineY, chunk.c_str());
      lineY += 12;
      start = i + 1;
      if (lineY > 64) break;
    }
  }

  display.sendBuffer();
}

// =============================================================
// setup()
// =============================================================
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("[Kavach] Booting...");

  pinMode(LED_PIN,    OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(LED_PIN,    LOW);
  digitalWrite(BUZZER_PIN, LOW);

  // ── OLED via SW I2C (no Wire needed, proven working) ─────
  display.begin();
  display.setContrast(255);
  showSplash();
  Serial.println("[Kavach] OLED ready (SH1106 SW I2C).");

  // ── DS18B20 ──────────────────────────────────────────────
  tempSensor.begin();
  tempSensor.setResolution(11);
  Serial.println("[Kavach] DS18B20 ready.");

  // ── MAX30100 via HW I2C Wire on GPIO21/22 (exclusive bus) ──
  Serial.println("[Kavach] Initialising MAX30100...");
  Wire.begin(MAX_SDA_PIN, MAX_SCL_PIN);
  Wire.setClock(100000);   // 100 kHz for better compatibility

  if (pox.begin()) {
    pox.setOnBeatDetectedCallback(onBeatDetected);
    pox.setIRLedCurrent(MAX30100_LED_CURR_7_6MA);
    poxReady = true;
    Serial.println("[Kavach] MAX30100 ready.");
  } else {
    poxReady = false;
    Serial.println("[WARN] MAX30100 not found — HR/SpO2 will show '--'");
    Serial.println("       Check: VIN=3.3V, GND, SDA=GPIO21, SCL=GPIO22");
    // Show warning on OLED briefly then continue
    showWarning("MAX30100 not found", "HR/SpO2 unavailable");
    delay(2000);
  }

  Serial.println("[Kavach] All systems go. Monitoring...");
}

// =============================================================
// loop()
// =============================================================
void loop() {
  if (poxReady) pox.update();

  if (millis() - lastReportMs < REPORT_MS) return;
  lastReportMs = millis();

  // 1. Temperature
  tempSensor.requestTemperatures();
  float tempC = tempSensor.getTempCByIndex(0);

  if (tempC == DEVICE_DISCONNECTED_C) {
    showWarning("DS18B20 not found", "Check GPIO27 wiring");
    Serial.println("[ERROR] DS18B20 disconnected.");
    delay(500);
    return;
  }

  // 2. HR + SpO2 (only if sensor present)
  int hr   = poxReady ? (int)pox.getHeartRate() : 0;
  int spo2 = poxReady ? (int)pox.getSpO2()      : 0;

  // 3. Medical Action Engine
  alertActive   = false;
  currentAction = "Vitals normal.\nYou are safe.";

  if (tempC >= SAFE_TEMP_MAX) {
    alertActive   = true;
    currentAction = "HEATSTROKE!\nCool down, call 911.";
  } else if (tempC <= SAFE_TEMP_MIN && tempC > 0) {
    alertActive   = true;
    currentAction = "HYPOTHERMIA!\nMove indoors, warm up.";
  } else if (hr > 0 && hr >= SAFE_HR_MAX) {
    alertActive   = true;
    currentAction = "HIGH HR!\nSit, rest, breathe deep.";
  } else if (spo2 > 0 && spo2 <= SAFE_SPO2_MIN) {
    alertActive   = true;
    currentAction = "LOW OXYGEN!\nMove to fresh air.";
  }

  // 4. Alert outputs
  blinkState = alertActive ? !blinkState : false;
  digitalWrite(LED_PIN,    blinkState);
  digitalWrite(BUZZER_PIN, blinkState);

  // 5. OLED
  showVitals(tempC, hr, spo2, alertActive, currentAction);

  // 6. Serial log
  Serial.printf("[%s] T:%.1fC | HR:%s | O2:%s | %s\n",
    alertActive ? "ALERT" : " SAFE",
    tempC,
    hr   > 0 ? String(hr).c_str()   : "--",
    spo2 > 0 ? String(spo2).c_str() : "--",
    currentAction.c_str());
}
