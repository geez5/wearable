// =============================================================
//  max_oled_test.cpp — Standalone OLED + MAX30100 test
//  Environment : max_oled_test
//
//  Flash with : pio run -e max_oled_test --target upload
//  Monitor    : pio device monitor
//
//  Hardware   : ESP32 DevKit V1
//               SH1106 128x64 OLED (SW I2C)
//                 SDA → GPIO 4
//                 SCK → GPIO 5
//               MAX30100 Pulse Oximeter (HW I2C)
//                 SDA → GPIO 21
//                 SCL → GPIO 22
//
//  Tests if both I2C buses can run simultaneously and display
//  live heart rate and SpO2 readings on the screen.
// =============================================================

#include <Arduino.h>
#include <Wire.h>
#include <U8g2lib.h>
#include "MAX30100_PulseOximeter.h"

#define OLED_SDA_PIN 4
#define OLED_SCL_PIN 5
#define MAX_SDA_PIN  21
#define MAX_SCL_PIN  22

#define REPORT_MS 1000

// ── OLED: SW I2C on GPIO4/5 ──────────────────────────────────
U8G2_SH1106_128X64_NONAME_F_SW_I2C display(U8G2_R2, /*clk=*/OLED_SCL_PIN, /*data=*/OLED_SDA_PIN, U8X8_PIN_NONE);

// ── MAX30100 ─────────────────────────────────────────────────
PulseOximeter pox;
bool poxReady = false;
uint32_t lastReportMs = 0;
int lastHR = 0;
int lastSpO2 = 0;

// Callback when a heartbeat is detected
void onBeatDetected() {
  Serial.println("Beat!");
}

// ── UI Drawing ───────────────────────────────────────────────
void drawScreen() {
  display.clearBuffer();
  display.setFont(u8g2_font_6x10_tr);

  // Title
  display.drawStr(10, 10, "MAX30100 TEST");
  display.drawHLine(0, 14, 128);

  // Sensor status
  display.setFont(u8g2_font_ncenB10_tr);
  if (!poxReady) {
    display.drawStr(10, 35, "SENSOR ERROR");
    display.setFont(u8g2_font_6x10_tr);
    display.drawStr(5, 50, "Check MAX30100 wiring");
  } else {
    // Readings
    char buf[32];
    
    snprintf(buf, sizeof(buf), "HR: %d bpm", lastHR);
    display.drawStr(10, 35, buf);
    
    snprintf(buf, sizeof(buf), "SpO2: %d %%", lastSpO2);
    display.drawStr(10, 55, buf);
  }

  display.sendBuffer();
}

// =============================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n=============================");
  Serial.println("  MAX30100 + OLED Test");
  Serial.println("=============================");

  // 1. Init OLED (SW I2C)
  Serial.println("[1] Initialising OLED on GPIO 4, 5...");
  display.begin();
  display.setContrast(255);
  display.clearBuffer();
  display.setFont(u8g2_font_6x10_tr);
  display.drawStr(10, 30, "Init MAX30100...");
  display.sendBuffer();

  // 2. Init MAX30100 (HW I2C)
  Serial.println("[2] Initialising MAX30100 on GPIO 21, 22...");
  
  // Enable internal pullups (Workaround for MAX30100 1.8V flaw)
  pinMode(MAX_SDA_PIN, INPUT_PULLUP);
  pinMode(MAX_SCL_PIN, INPUT_PULLUP);
  
  Wire.begin(MAX_SDA_PIN, MAX_SCL_PIN);
  Wire.setClock(100000); // 100kHz for stability
  
  // Quick I2C Scan
  Serial.println("    -> Scanning I2C bus on pins 21/22...");
  byte error, address;
  int nDevices = 0;
  for(address = 1; address < 127; address++ ) {
    Wire.beginTransmission(address);
    error = Wire.endTransmission();
    if (error == 0) {
      Serial.printf("       Found device at 0x%02X\n", address);
      nDevices++;
    }
  }
  if (nDevices == 0) {
    Serial.println("       No I2C devices found on 21/22.");
  }

  if (pox.begin()) {
    poxReady = true;
    pox.setOnBeatDetectedCallback(onBeatDetected);
    pox.setIRLedCurrent(MAX30100_LED_CURR_7_6MA);
    Serial.println("    -> MAX30100 OK ✓");
  } else {
    poxReady = false;
    Serial.println("    -> ERROR: MAX30100 not found!");
  }

  drawScreen();
  Serial.println("\nStarting loop...");
}

// =============================================================
void loop() {
  if (poxReady) {
    // MAX30100 requires continuous polling
    pox.update();

    // Update screen and serial once a second
    if (millis() - lastReportMs >= REPORT_MS) {
      lastHR = (int)pox.getHeartRate();
      lastSpO2 = (int)pox.getSpO2();
      
      Serial.printf("HR: %d bpm  |  SpO2: %d %%\n", lastHR, lastSpO2);
      drawScreen();
      
      lastReportMs = millis();
    }
  } else {
    // If no sensor, just delay to not spam the loop
    delay(1000);
  }
}
