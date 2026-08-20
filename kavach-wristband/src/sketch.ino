// =============================================================
//  Project  : Kavach Safety Wristband (First-Aid Edition)
//  File     : sketch.ino
//  Hardware : ESP32 DevKit C v4
//
//  What it does
//  ------------
//  Monitors Body Temperature (DS18B20) and Heart Rate (MAX30102).
//  If any vital sign leaves the safe range, it triggers the alert
//  (buzzer/vibration) and displays critical Medical First Aid 
//  instructions on the OLED screen.
// =============================================================

#include <OneWire.h>
#include <DallasTemperature.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "MAX30105.h"
#include "heartRate.h"

// ── Simulator Toggle ─────────────────────────────────────────
// Wokwi does NOT have a native MAX30102 sensor. 
// Set this to 'true' to use the Potentiometer to simulate your Heart Rate in Wokwi.
// Set this to 'false' when flashing to your real ESP32 hardware!
const bool SIMULATE_IN_WOKWI = true;

// ── Pin assignments ──────────────────────────────────────────
#define ONE_WIRE_BUS  27
#define LED_PIN       26  // Acts as Vibration Motor simulation
#define BUZZER_PIN    25
#define POT_PIN       4   // Used to simulate Heart Rate in Wokwi

// ── OLED ─────────────────────────────────────────────────────
#define SCREEN_WIDTH   128
#define SCREEN_HEIGHT   64
#define OLED_RESET      -1
#define SCREEN_ADDRESS 0x3C

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// ── Temperature sensor ────────────────────────────────────────
OneWire           oneWire(ONE_WIRE_BUS);
DallasTemperature tempSensor(&oneWire);

// ── MAX30102 Sensor ───────────────────────────────────────────
MAX30105 particleSensor;

// ── Safe Medical Ranges ──────────────────────────────────────
const float SAFE_TEMP_MIN = 35.0f;
const float SAFE_TEMP_MAX = 38.0f;

const int SAFE_HR_MAX = 120; // Max resting heart rate before alert
const int SAFE_SPO2_MIN = 92; // Min SpO2 percentage

// ── Runtime state ────────────────────────────────────────────
bool alertActive = false;
bool blinkState  = false;
String currentAction = "";

// HR Tracking
const byte RATE_SIZE = 4;
byte rates[RATE_SIZE];
byte rateSpot = 0;
long lastBeat = 0;
float beatsPerMinute = 0;
int beatAvg = 0;
int simulatedSpO2 = 98;

// ─────────────────────────────────────────────────────────────
// Forward declarations
void updateDisplay(float temp, int hr, int spo2, bool alert, String action);
void showSensorError(String sensorName);

// =============================================================
// setup()
// =============================================================
void setup() {
  Serial.begin(115200);

  pinMode(LED_PIN,    OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(LED_PIN,    LOW);
  digitalWrite(BUZZER_PIN, LOW);

  // Init Temp
  tempSensor.begin();
  tempSensor.setResolution(9);

  // Init OLED
  if (!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    Serial.println("[FATAL] SSD1306 init failed.");
    for (;;);
  }

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(2);
  display.setCursor(20, 10);
  display.println("KAVACH");
  display.setTextSize(1);
  display.setCursor(15, 35);
  display.println("Medical Monitor");
  display.display();

  // Init MAX30102 (Skip if simulating in Wokwi)
  if (!SIMULATE_IN_WOKWI) {
    if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
      Serial.println("[FATAL] MAX30102 was not found. Please check wiring/power.");
      showSensorError("MAX30102");
      for (;;);
    }
    particleSensor.setup(); 
    particleSensor.setPulseAmplitudeRed(0x0A); 
    particleSensor.setPulseAmplitudeGreen(0);  
  }

  delay(1500);
}

// =============================================================
// loop()
// =============================================================
void loop() {
  // 1 ── Read Temperature
  tempSensor.requestTemperatures();
  float tempC = tempSensor.getTempCByIndex(0);

  if (tempC == DEVICE_DISCONNECTED_C) {
    digitalWrite(LED_PIN, LOW);
    digitalWrite(BUZZER_PIN, LOW);
    showSensorError("DS18B20");
    delay(500);
    return;
  }

  // 2 ── Read Heart Rate
  if (SIMULATE_IN_WOKWI) {
    // WOKWI SIMULATION: Use Potentiometer slider to mock Heart Rate (50 to 180 BPM)
    int potValue = analogRead(POT_PIN);
    beatAvg = map(potValue, 0, 4095, 50, 180);
    
    // Drop SpO2 if heart rate is dangerously high to mock a crisis
    simulatedSpO2 = (beatAvg > SAFE_HR_MAX) ? 89 : 98;
  } else {
    // REAL HARDWARE: Use MAX30102
    long irValue = particleSensor.getIR();
    
    if (checkForBeat(irValue) == true) {
      long delta = millis() - lastBeat;
      lastBeat = millis();

      beatsPerMinute = 60 / (delta / 1000.0);

      if (beatsPerMinute < 255 && beatsPerMinute > 20) {
        rates[rateSpot++] = (byte)beatsPerMinute;
        rateSpot %= RATE_SIZE;

        beatAvg = 0;
        for (byte x = 0 ; x < RATE_SIZE ; x++)
          beatAvg += rates[x];
        beatAvg /= RATE_SIZE;
      }
    }

    if (irValue < 50000) {
      beatAvg = 0;
      simulatedSpO2 = 0;
    } else {
      simulatedSpO2 = (beatAvg > SAFE_HR_MAX) ? 89 : 98;
    }
  }

  // 3 ── Medical Action Engine
  alertActive = false;
  currentAction = "Vitals are normal.\nYou are safe.";

  if (tempC >= SAFE_TEMP_MAX) {
    alertActive = true;
    currentAction = "HEATSTROKE RISK!\nCool down rapidly, seek shade, call 911.";
  } else if (tempC <= SAFE_TEMP_MIN && tempC > 0) {
    alertActive = true;
    currentAction = "HYPOTHERMIA RISK!\nMove indoors, drink warm fluids.";
  } else if (beatAvg >= SAFE_HR_MAX) {
    alertActive = true;
    currentAction = "HIGH HR DETECTED!\nSit down, rest, and take deep breaths.";
  } else if (simulatedSpO2 > 0 && simulatedSpO2 <= SAFE_SPO2_MIN) {
    alertActive = true;
    currentAction = "LOW OXYGEN!\nMove to fresh air, breathe deeply.";
  }

  // 4 ── Drive Alerts
  if (alertActive) {
    blinkState = !blinkState;
  } else {
    blinkState = false;
  }
  digitalWrite(LED_PIN, blinkState);
  digitalWrite(BUZZER_PIN, blinkState);

  // 5 ── OLED & Serial Update 
  static unsigned long lastDisplayUpdate = 0;
  if (millis() - lastDisplayUpdate > 500) {
    updateDisplay(tempC, beatAvg, simulatedSpO2, alertActive, currentAction);
    Serial.printf("[%s] Temp: %.1f C | HR: %d bpm | SpO2: %d%% | Action: %s\n",
                  alertActive ? "ALERT" : "SAFE", tempC, beatAvg, simulatedSpO2, currentAction.c_str());
    lastDisplayUpdate = millis();
  }
}

// =============================================================
// OLED Renderer
// =============================================================
void updateDisplay(float temp, int hr, int spo2, bool alert, String action) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // Top Bar: Vitals
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("T:"); display.print(temp, 1); display.print("C");
  
  display.setCursor(55, 0);
  display.print("HR:"); display.print(hr);
  
  display.setCursor(95, 0);
  display.print("O2:"); display.print(spo2); display.print("%");

  display.drawLine(0, 10, SCREEN_WIDTH - 1, 10, SSD1306_WHITE);

  // Middle Area: Status Alert
  display.setTextSize(2);
  if (alert) {
    display.setCursor(14, 16);
    display.print("! ALERT !");
  } else {
    display.setCursor(34, 16);
    display.print("SAFE");
  }

  // Bottom Area: Medical Action Instructions
  display.drawLine(0, 36, SCREEN_WIDTH - 1, 36, SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 40);
  display.println(action);

  display.display();
}

void showSensorError(String sensorName) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(10, 1);
  display.print("KAVACH SYSTEM");
  display.drawLine(0, 11, SCREEN_WIDTH - 1, 11, SSD1306_WHITE);
  display.setCursor(12, 20);
  display.print("** SENSOR ERROR **");
  display.setCursor(4, 34);
  display.print(sensorName);
  display.print(" not found");
  display.display();
}
