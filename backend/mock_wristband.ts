const http = require('http');

const DEVICE_MAC = 'AA:BB:CC:DD:EE:FF';
const API_URL = 'http://localhost:3000/api/telemetry';

let loopCounter = 0;

function sendTelemetry() {
  loopCounter++;

  // 1. Simulate Temperature
  // Normal is ~36.5, but occasionally spiked
  let tempC = 36.5 + (Math.random() * 0.5);
  
  // 2. Simulate Heart Rate & SpO2
  let hr = 70 + Math.floor(Math.random() * 10);
  let spo2 = 98;

  // Force Anomalies to test First Aid Engine
  if (loopCounter % 20 === 0) {
    // Every ~40 seconds, trigger Heatstroke
    tempC = 39.5; 
  } else if (loopCounter % 20 === 5) {
    // Trigger High HR
    hr = 135;
    spo2 = 88;
  } else if (loopCounter % 20 === 10) {
    // Trigger Hypothermia
    tempC = 34.0;
  }

  // 3. Run Medical Action Engine
  let isAlert = false;
  let action = "Vitals are normal. You are safe.";

  if (tempC >= 38.0) {
    isAlert = true;
    action = "HEATSTROKE RISK! Cool down rapidly, seek shade, call 911.";
  } else if (tempC <= 35.0) {
    isAlert = true;
    action = "HYPOTHERMIA RISK! Move indoors, drink warm fluids.";
  } else if (hr >= 120) {
    isAlert = true;
    action = "HIGH HR DETECTED! Sit down, rest, and take deep breaths.";
  } else if (spo2 <= 92) {
    isAlert = true;
    action = "LOW OXYGEN! Move to fresh air, breathe deeply.";
  }

  const payload = JSON.stringify({
    deviceMac: DEVICE_MAC,
    temperature: tempC,
    heartRate: hr,
    spo2,
    isAlert,
    action
  });

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const req = http.request(API_URL, options, (res: any) => {
    if (res.statusCode === 200) {
      console.log(`[Sent] T:${tempC.toFixed(1)}C | HR:${hr} | O2:${spo2}% => ${isAlert ? 'ALERT' : 'SAFE'}`);
    }
  });

  req.on('error', (e: any) => {
    console.error(`Problem with request: ${e.message}`);
  });

  req.write(payload);
  req.end();
}

console.log('Starting Mock Kavach Wristband Simulator...');
console.log('Streaming to ' + API_URL);

// Send data every 2 seconds
setInterval(sendTelemetry, 2000);
