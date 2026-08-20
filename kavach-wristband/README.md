# Kavach Safety Wristband

> **कवच** *(kavach)* — Sanskrit for *armour* or *shield*

---

## Problem Statement

Heat-related illness is a silent risk for workers in high-temperature environments — foundries,
kitchens, construction sites — as well as for the elderly and patients undergoing fever
monitoring at home. By the time a person notices dangerous body-heat build-up, the window
for easy intervention has often already passed. **Kavach** is a wrist-worn ESP32 device that
continuously reads ambient/body temperature from a DS18B20 probe and compares it against a
user-adjustable threshold. The moment temperature meets or exceeds that threshold, a red LED
and buzzer fire an unmissable alert, and the OLED display switches from a calm **SAFE** status
to a prominent **! ALERT !** screen. It is designed for makers, students, and safety-conscious
engineers who want a rapid-prototype, simulation-first wearable they can build, test in Wokwi,
and then deploy on real hardware — all from a single codebase.

---

## Hardware

### Bill of Materials

| # | Component | Notes |
|---|---|---|
| 1 | ESP32 DevKit C v4 | Main microcontroller |
| 2 | DS18B20 temperature sensor | 1-Wire, waterproof probe recommended |
| 3 | 4.7 kΩ resistor | DS18B20 data-line pull-up to 3V3 |
| 4 | SSD1306 OLED (128 × 64) | I2C, address 0x3C |
| 5 | Potentiometer (10 kΩ) | Threshold dial |
| 6 | Red LED | Alert indicator |
| 7 | 1 kΩ resistor | LED current-limiting |
| 8 | Active buzzer | Alert tone |

### Wiring Table

| Component | ESP32 Pin | Purpose |
|---|---|---|
| DS18B20 VCC | 3V3 | Sensor power |
| DS18B20 GND | GND | Sensor ground |
| DS18B20 DQ | GPIO 27 | 1-Wire data (+ 4.7 kΩ pull-up to 3V3) |
| Potentiometer VCC | 3V3 | Dial power |
| Potentiometer GND | GND | Dial ground |
| Potentiometer SIG | GPIO 4 | ADC — threshold level |
| LED anode | GPIO 26 → 1 kΩ | Alert LED (resistor in series) |
| LED cathode | GND | LED ground |
| Buzzer + | GPIO 25 | Alert tone |
| Buzzer − | GND | Buzzer ground |
| OLED VCC | 3V3 | Display power |
| OLED GND | GND | Display ground |
| OLED SDA | GPIO 22 | I2C data |
| OLED SCL | GPIO 21 | I2C clock |

---

## How to Run

### Option 1 — Wokwi Browser (no installation)

1. Open the live simulation:
   **[wokwi.com/projects/471685593568552961](https://wokwi.com/projects/471685593568552961)**
2. Click **▶ Play**.
3. Use the **Serial Monitor** tab to watch live temperature and threshold output.
4. Click the **DS18B20** to change the simulated temperature.
5. Click the **potentiometer** and drag to adjust the alert threshold.

### Option 2 — Local PlatformIO + VS Code Wokwi Extension

#### Prerequisites

- [VS Code](https://code.visualstudio.com/)
- [PlatformIO IDE extension](https://marketplace.visualstudio.com/items?itemName=platformio.platformio-ide)
- [Wokwi for VS Code extension](https://marketplace.visualstudio.com/items?itemName=wokwi.wokwi-vscode)

#### Steps

```powershell
# 1. Clone the repo and open the project folder in VS Code
git clone <repo-url>
cd kavach-wristband

# 2. Build the firmware — PlatformIO auto-installs all lib_deps
pio run

# 3. Simulate in VS Code
#    Press F1 → "Wokwi: Start Simulator"
#    The extension reads wokwi.toml → loads diagram.json + firmware.bin automatically
```

#### Flash to real hardware

```powershell
pio run --target upload   # compile + upload to connected ESP32
pio device monitor        # Serial Monitor at 115200 baud
```

`platformio.ini` defines the board (`esp32dev`) and all four library dependencies.
`wokwi.toml` points the Wokwi extension at `.pio/build/esp32dev/firmware.{elf,bin}`.

---

## Demo

### Simulation recording

![Wokwi simulation — SAFE and ALERT states cycling as the temperature dial is adjusted](docs/demo.gif)

*Add `docs/demo.gif` — a screen recording of the Wokwi simulation cycling between SAFE and ALERT.*

### Hardware photo

![Kavach wristband — ESP32 DevKit with OLED, DS18B20 probe, LED, and buzzer on a breadboard](docs/hardware-photo.jpg)

*Add `docs/hardware-photo.jpg` — a photo of the assembled breadboard prototype.*

---

## Project Structure

```
kavach-wristband/
├── src/
│   └── sketch.ino       # Full 11-stage firmware
├── docs/
│   ├── demo.gif          # Simulation screen recording (add yours)
│   └── hardware-photo.jpg# Breadboard prototype photo (add yours)
├── diagram.json          # Wokwi circuit diagram
├── platformio.ini        # PlatformIO board + library config
├── wokwi.toml            # Wokwi VS Code extension config
└── README.md
```

---

## Firmware Overview

The firmware was written in **11 incremental stages**, each verifiable in isolation:

| Stage | What it does |
|---|---|
| 1 | Boot check — Serial heartbeat confirms ESP32 starts |
| 2 | DS18B20 temperature reading via 1-Wire (GPIO 27) |
| 3 | OLED splash screen ("KAVACH / Safety Monitor") |
| 4 | Potentiometer threshold dial (GPIO 4, mapped 30–45 °C) |
| 5 | Live OLED dashboard — temp + threshold as text |
| 6 | Alert state comparison — `ALERT` / `SAFE` on OLED |
| 7 | LED (GPIO 26) + buzzer (GPIO 25) solid on/off |
| 8 | Hysteresis dead-band — prevents flicker at the boundary |
| 9 | Non-blocking blink/beep — toggle without freezing reads |
| 10 | Sensor-disconnect guard — dedicated error screen |
| 11 | Final polish — layout, logging, header comment |

---

## Future Work

### Sensors

| Sensor | Replaces | Adds |
|---|---|---|
| **MAX30102** | DS18B20 | Heart rate (BPM) + blood oxygen (SpO₂) via photoplethysmography |
| **MLX90614** | DS18B20 | Contactless infrared body temperature (no skin probe required) |

Combining MAX30102 + MLX90614 in a single wristband would give a three-metric vital-signs
monitor (SpO₂, HR, temp) comparable to a pulse oximeter — without requiring physical contact
beyond the wrist strap.

### Connectivity

- **Wi-Fi / MQTT** — push readings to a dashboard (Node-RED, Grafana, Home Assistant)
- **BLE** — stream data to a companion mobile app for logging and history

### Hardware

- Custom PCB with LiPo charging circuit (TP4056) for true wearable form factor
- Silicone wristband enclosure with waterproofing for the DS18B20 probe

### Firmware

- NTP-synced timestamps on Serial logs
- Moving-average filter on temperature readings to reduce noise
- OTA (over-the-air) firmware update support via ESP32 Arduino OTA library

---

## License

MIT — free to use, modify, and distribute with attribution.
