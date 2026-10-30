/*
 * Maargdarshak — ESP32 laser aiming node
 * ------------------------------------------------------------------
 * A laser pointer on a pan/tilt servo bracket, mounted above the aisle. Every second it asks the
 * server where to point and aims the dot at the assigned parking bay.
 *
 * Server endpoint : GET /api/lasers/<LASER_ID>/command   (header X-API-Key)
 * Libraries       : ArduinoJson 7.x, ESP32Servo
 * Board           : "ESP32 Dev Module"
 *
 * ⚠ LASER SAFETY: use only a Class 1 / Class 2 (<1 mW) module for prototypes, never aim above
 *   the horizon, and never point at people/vehicle windscreens. The firmware turns the laser OFF
 *   whenever the server says nothing to show, Wi-Fi is lost, or the unit is disabled/faulty.
 *
 * NOTE: reference firmware, not compiled/flashed in the build environment. Calibrate on site.
 */
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>

// ---------- configuration ----------
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
const char* SERVER    = "http://192.168.1.100:3001";
const char* API_KEY   = "maargdarshak-sensor-key-2026";
const char* LASER_ID  = "LZ-01";                 // must exist in Laser Control

// Where this unit hangs, in metres, in the same coordinate system as the lot map
// (origin = top-left of the canvas, x to the right, y downwards; 24 px = 1 m).
const float MOUNT_X_M = 2.0;
const float MOUNT_Y_M = 3.0;
const float MOUNT_HEIGHT_M = 3.5;                // height above ground

// Servo calibration: angle (deg) when pointing along +x / straight down.
const int PAN_CENTER_DEG  = 90;                  // pan servo angle that points along +x
const int TILT_DOWN_DEG   = 90;                  // tilt servo angle that points straight down
const int TILT_SIGN       = 1;                   // flip to -1 if tilt moves the wrong way

const uint8_t PIN_PAN = 13, PIN_TILT = 12, PIN_LASER = 14;  // laser on a PWM-capable pin
const unsigned long POLL_MS = 1000;
// -----------------------------------

Servo pan, tilt;
unsigned long lastPoll = 0;

void laserPwm(int percent, bool pulse) {
  static bool phase = false;
  phase = !phase;
  int duty = (pulse && phase) ? 0 : map(constrain(percent, 0, 100), 0, 100, 0, 255);
  analogWrite(PIN_LASER, duty);
}

void laserOff() { analogWrite(PIN_LASER, 0); }

void aimAt(float tx, float ty) {
  float dx = tx - MOUNT_X_M, dy = ty - MOUNT_Y_M;
  float panDeg  = atan2f(dy, dx) * 180.0f / PI;               // direction on the ground
  float groundD = sqrtf(dx * dx + dy * dy);
  float tiltDeg = atan2f(groundD, MOUNT_HEIGHT_M) * 180.0f / PI;  // 0° = straight down
  pan.write(constrain(PAN_CENTER_DEG + (int)panDeg, 0, 180));
  tilt.write(constrain(TILT_DOWN_DEG + TILT_SIGN * (int)tiltDeg, 0, 180));
}

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) delay(250);
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LASER, OUTPUT);
  laserOff();
  pan.attach(PIN_PAN);
  tilt.attach(PIN_TILT);
  aimAt(MOUNT_X_M, MOUNT_Y_M);
  connectWifi();
}

void loop() {
  if (millis() - lastPoll < POLL_MS) return;
  lastPoll = millis();

  connectWifi();
  if (WiFi.status() != WL_CONNECTED) { laserOff(); return; }   // fail safe

  HTTPClient http;
  http.begin(String(SERVER) + "/api/lasers/" + LASER_ID + "/command");
  http.addHeader("X-API-Key", API_KEY);
  int code = http.GET();
  if (code != 200) { laserOff(); http.end(); Serial.printf("command HTTP %d\n", code); return; }

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, http.getString());
  http.end();
  if (err) { laserOff(); return; }

  bool enabled = doc["enabled"] | false;
  const char* mode = doc["mode"] | "guidance";
  int intensity = doc["intensity"] | 0;
  bool pulse = doc["pulse"] | false;

  if (!enabled || doc["target"].isNull()) { laserOff(); return; }   // nothing to show

  if (strcmp(mode, "test") == 0) {
    // test pattern: sweep a small circle around the mount point's target
    static float a = 0; a += 0.6f;
    aimAt(doc["target"]["xMeters"].as<float>() + cosf(a), doc["target"]["yMeters"].as<float>() + sinf(a));
  } else {
    aimAt(doc["target"]["xMeters"].as<float>(), doc["target"]["yMeters"].as<float>());
  }
  laserPwm(intensity, pulse);
  Serial.printf("aim slot %s\n", doc["target"]["slotId"].as<const char*>());
}
