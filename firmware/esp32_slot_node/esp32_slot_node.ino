/*
 * Maargdarshak — ESP32 slot sensor node
 * ------------------------------------------------------------------
 * Reads several ultrasonic sensors (HC-SR04 / JSN-SR04T), debounces them and
 * reports occupancy to the server in ONE batch request.
 *
 * Server endpoint : POST /api/sensors/batch      (header X-API-Key)
 * Libraries       : ArduinoJson 7.x  (Library Manager)
 * Board           : "ESP32 Dev Module"
 *
 * NOTE: reference firmware. It was written against the server API in this repo and
 * has not been compiled/flashed in the build environment — test on your own hardware.
 */
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ---------- configuration ----------
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
const char* SERVER    = "http://192.168.1.100:3001";       // PC running `npm run dev` / `npm start`
const char* API_KEY   = "maargdarshak-sensor-key-2026";    // Settings → API key in the control room

struct Slot { const char* sensorId; uint8_t trig; uint8_t echo; };
// sensorId must match the slot's sensor in the dashboard (default: "US-" + slot id)
Slot SLOTS[] = {
  { "US-A01", 5, 18 },
  { "US-A02", 19, 21 },
};
const int N = sizeof(SLOTS) / sizeof(SLOTS[0]);

const float OCCUPIED_BELOW_CM = 150.0;  // car roof / bonnet closer than this => occupied
const float MIN_VALID_CM      = 5.0;
const int   CONFIRM_READS     = 3;      // consecutive agreeing reads before a change is accepted
const unsigned long READ_EVERY_MS      = 1000;
const unsigned long HEARTBEAT_EVERY_MS = 30000;
// -----------------------------------

bool state[N], candidate[N];
int  agree[N];
float lastDistance[N];
unsigned long lastRead = 0, lastReport = 0;
bool dirty = true;  // report once at boot

float measureCm(uint8_t trig, uint8_t echo) {
  digitalWrite(trig, LOW);  delayMicroseconds(3);
  digitalWrite(trig, HIGH); delayMicroseconds(10);
  digitalWrite(trig, LOW);
  unsigned long us = pulseIn(echo, HIGH, 30000UL);  // 30 ms timeout ≈ 5 m
  if (us == 0) return -1;
  return us * 0.0343f / 2.0f;
}

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) delay(250);
}

void report() {
  connectWifi();
  if (WiFi.status() != WL_CONNECTED) return;

  JsonDocument doc;
  JsonArray readings = doc["readings"].to<JsonArray>();
  for (int i = 0; i < N; i++) {
    JsonObject r = readings.add<JsonObject>();
    r["sensorId"]   = SLOTS[i].sensorId;
    r["occupied"]   = state[i];
    r["distanceCm"] = lastDistance[i];
    r["rssi"]       = WiFi.RSSI();
  }
  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.begin(String(SERVER) + "/api/sensors/batch");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", API_KEY);
  int code = http.POST(body);
  Serial.printf("report -> HTTP %d\n", code);
  http.end();

  if (code == 200) { dirty = false; lastReport = millis(); }
}

void setup() {
  Serial.begin(115200);
  for (int i = 0; i < N; i++) {
    pinMode(SLOTS[i].trig, OUTPUT);
    pinMode(SLOTS[i].echo, INPUT);
    state[i] = candidate[i] = false;
    agree[i] = 0;
    lastDistance[i] = -1;
  }
  connectWifi();
}

void loop() {
  unsigned long now = millis();
  if (now - lastRead >= READ_EVERY_MS) {
    lastRead = now;
    for (int i = 0; i < N; i++) {
      float d = measureCm(SLOTS[i].trig, SLOTS[i].echo);
      if (d < 0) continue;                       // no echo: ignore this sample
      lastDistance[i] = d;
      bool occ = (d > MIN_VALID_CM && d < OCCUPIED_BELOW_CM);
      if (occ == candidate[i]) agree[i]++; else { candidate[i] = occ; agree[i] = 1; }
      if (agree[i] >= CONFIRM_READS && state[i] != candidate[i]) {
        state[i] = candidate[i];
        dirty = true;
        Serial.printf("%s -> %s (%.0f cm)\n", SLOTS[i].sensorId, state[i] ? "OCCUPIED" : "FREE", d);
      }
    }
  }
  if (dirty || now - lastReport >= HEARTBEAT_EVERY_MS) report();
}
