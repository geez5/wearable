// =============================================================
//  oled_test.cpp — Standalone OLED display test
//  Environment : oled_test  (does NOT compile sketch.ino)
//
//  Flash with : pio run -e oled_test --target upload
//  Monitor    : pio device monitor
//
//  Hardware   : ESP32 DevKit V1
//               SH1106 128x64 I2C OLED
//               VDD  → 3.3V
//               GND  → GND
//               SDA  → GPIO 21
//               SCK  → GPIO 22  (this module labels SCL as SCK)
//
//  No other sensors are used in this test.
// =============================================================

#include <Arduino.h>
#include <U8g2lib.h>

#define SDA_PIN 21
#define SCL_PIN 22

// SW I2C (bit-bang) — proven to work, uses internal GPIO pull-ups
// U8G2_R0 = proven to show content in brute-force test
// If text appears upside down, physically rotate the OLED module 180°
U8G2_SH1106_128X64_NONAME_F_SW_I2C oled(U8G2_R0, /*clk=*/SCL_PIN, /*data=*/SDA_PIN, U8X8_PIN_NONE);

// ── Simple test screen ───────────────────────────────────────
void drawTestScreen(int frame) {
  oled.clearBuffer();

  // Border
  oled.drawFrame(0, 0, 128, 64);

  // Line 1 — big title
  oled.setFont(u8g2_font_ncenB14_tr);
  oled.drawStr(16, 18, "KAVACH");

  // Divider
  oled.drawHLine(2, 22, 124);

  // Line 2
  oled.setFont(u8g2_font_7x13B_tr);
  oled.drawStr(14, 37, "OLED TEST");

  // Line 3
  oled.setFont(u8g2_font_6x10_tr);
  oled.drawStr(8, 50, "DISPLAY WORKING");

  // Animated dot so you know it's alive
  char dots[5] = "    ";
  int d = (frame % 4);
  for (int i = 0; i < d; i++) dots[i] = '.';
  oled.drawStr(106, 60, dots);

  oled.sendBuffer();
}

// =============================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n=============================");
  Serial.println("  Kavach OLED Test (SW I2C)");
  Serial.println("  SH1106 @ 0x3C");
  Serial.println("  SDA=GPIO21, SCL=GPIO22");
  Serial.println("=============================");

  Serial.println("[1] Initialising SH1106 via SW I2C...");
  oled.begin();
  oled.setContrast(255);
  Serial.println("[2] Drawing test screen...");
  Serial.println("    --> OLED should now show KAVACH / OLED TEST / DISPLAY WORKING");
  Serial.println("\nIf your OLED shows KAVACH / OLED TEST / DISPLAY WORKING");
  Serial.println("then the display hardware and driver are working correctly.");
  Serial.println("=============================================");
}

// =============================================================
int frameCount = 0;

void loop() {
  drawTestScreen(frameCount++);

  // Print heartbeat every 2 seconds
  if (frameCount % 20 == 0) {
    Serial.printf("[alive] frame=%d — OLED should be showing test screen\n", frameCount);
  }

  delay(100);
}
