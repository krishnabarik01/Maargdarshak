# Maargdarshak (मार्गदर्शक)
### Laser-Based Smart Parking Guidance System

Maargdarshak helps drivers find and reach a free parking bay quickly. Ultrasonic sensors detect which bays are vacant, a microcontroller reports the data to a server, and a low-power laser unit projects a visible guide onto the ground that leads the driver to the best free bay. Operators get a live control room; drivers get a gate-kiosk page with the route.

This repository contains the **full software side**: backend (REST + WebSocket + SQLite), the React control room / driver kiosk, a traffic simulator for demos without hardware, and reference ESP32 firmware.

---

## How it maps to the abstract

| Abstract says | Where it lives |
| --- | --- |
| Sensors detect vacant / occupied slots | `POST /api/sensors/reading` and `/batch` (ESP32 firmware in `firmware/esp32_slot_node`) |
| Microcontroller processes sensor data | ESP32 debounces readings; server applies them in `server/parking.js` |
| Laser projects directional indicators to guide drivers | `server/guidance.js` picks the best bay, assigns a laser unit, `GET /api/lasers/:id/command` tells the laser node where to aim (`firmware/esp32_laser_node`) |
| LED indicators / digital display | Gate kiosk `/driver` (route map + assigned bay) |
| Less searching, less movement, better space use | Guidance picks the shortest path; KPIs on the dashboard; adaptive car/2-wheeler bay layout |
| Mobile apps, dashboards, management | Control room (dashboard, lot map, sessions + fees, alerts, devices, analytics, settings) |

---

## Quick start

**Requirements:** Node.js **22.13 or newer** (https://nodejs.org). No C++ build tools needed — the database uses Node's built-in SQLite.

```bash
npm install
npm run dev
```

* Control room: http://localhost:5173
* Driver / gate kiosk (public): http://localhost:5173/driver
* API + WebSocket: http://localhost:3001

Single-port production style (frontend served by the API):

```bash
npm start            # builds the frontend, then serves everything on http://localhost:3001
```

Optional: copy `.env.example` to `.env` and set a long random `JWT_SECRET` (the server warns if you don't).

**Hinglish quick note:** `npm install` ke baad `npm run dev` chalao, browser me `localhost:5173` kholo. Bina hardware ke bhi demo chalta hai kyunki simulator gaadiyan khud bhejta hai (Settings me on/off).

### Demo accounts

| Role | Email | Password | Can do |
| --- | --- | --- | --- |
| Admin | `admin@maargdarshak.in` | `admin123` | everything, settings, users, slots |
| Operator | `operator@maargdarshak.in` | `operator123` | lot map, lasers, layouts, manual entry/exit |
| Viewer | `viewer@maargdarshak.in` | `viewer123` | read-only |

Change these (Settings → Users) before any real deployment.

---

## Laser guidance flow

1. Driver arrives at the gate kiosk and taps **Guide me with laser** (EV / accessible options available).
2. `POST /api/guidance/request` → the engine scores every free bay of the right type by path distance from the gate (gate → entry lane → aisle). EV and accessible bays are kept free for those who need them (rules can be toggled in Adaptive Layout).
3. The bay is **held** for 2 minutes (configurable), a free laser unit in that zone is pointed at it, and the kiosk shows the route + ticket.
4. The slot sensor sees the car → server opens a parking session, releases the laser and the hold. If nobody arrives the hold expires and the laser is released.
5. When the car leaves the sensor reports "free" → session closes, fee is calculated (free minutes + hourly rate from Settings).

Everything is pushed live to all screens over WebSocket (`/ws`).

---

## Hardware integration

All hardware calls use the header `X-API-Key` (Settings → API key; default `maargdarshak-sensor-key-2026` — **change it**).

```bash
# one sensor
curl -X POST http://localhost:3001/api/sensors/reading \
  -H "Content-Type: application/json" -H "X-API-Key: maargdarshak-sensor-key-2026" \
  -d '{"sensorId":"US-A01","occupied":true,"distanceCm":42,"battery":90,"rssi":-60}'

# many sensors at once
curl -X POST http://localhost:3001/api/sensors/batch -H "Content-Type: application/json" \
  -H "X-API-Key: maargdarshak-sensor-key-2026" \
  -d '{"readings":[{"sensorId":"US-A01","occupied":true},{"sensorId":"US-A02","occupied":false}]}'

# what should laser LZ-01 do right now?
curl http://localhost:3001/api/lasers/LZ-01/command -H "X-API-Key: maargdarshak-sensor-key-2026"
```

Sensor IDs are `US-<slot id>` (e.g. slot `A01` → `US-A01`). Unknown sensors get a 404.

Reference firmware (Arduino IDE, ESP32):

* `firmware/esp32_slot_node/` — HC-SR04 / JSN-SR04T sensors, debounced, batched reporting.
* `firmware/esp32_laser_node/` — pan/tilt servo + laser module that aims at the target coordinates from the server.

> The firmware is provided as a **starting point**. It was written against this server's API but has not been compiled or flashed on real hardware — expect to calibrate pins, mount position, servo angles and distance thresholds on site.
> **Laser safety:** for prototypes use only Class 1/2 (<1 mW) modules, never aim at eyes or windscreens, and keep the "laser off when no target" behaviour.

---

## API overview

| Area | Endpoints |
| --- | --- |
| Auth | `POST /api/auth/login`, `GET /api/auth/me` |
| Lot | `GET /api/lot/state`, `GET/POST/PATCH/DELETE /api/slots[/:id]` |
| Guidance (public) | `POST /api/guidance/request`, `GET /api/guidance/active`, `GET /api/guidance/stats`, `DELETE /api/guidance/:ticket` |
| Hardware | `POST /api/sensors/reading`, `/batch`, `/heartbeat`, `GET /api/lasers/:id/command` |
| Sessions | `GET /api/sessions` (+ `exportCsv=true`), `POST /api/vehicles/entry`, `/exit` |
| Lasers / devices | `GET/PATCH /api/lasers`, `POST /api/lasers/test-pattern`, `GET/PATCH /api/devices` |
| Layout | `GET /api/layout`, `POST /api/layout/preview`, `/apply` (modes `2w-peak`, `car-peak`, `balanced`) |
| Analytics | `/api/analytics/kpis`, `occupancy-trend`, `entries-by-type`, `zone-utilization`, `capacity-comparison`, `recent-events` |
| Alerts / settings | `GET/PATCH /api/alerts`, `GET/POST /api/settings`, `/api/settings/users` |
| Health | `GET /api/health` |

WebSocket events (`ws://host/ws`): `slot.updated`, `vehicle.entered`, `vehicle.exited`, `guidance.assigned`, `guidance.resolved`, `laser.updated`, `device.status`, `alert.updated`, `layout.changing`, `layout.changed`, `lot.state`.

---

## Testing

```bash
npm run server        # terminal 1
npm run smoke         # terminal 2 – 40 end-to-end checks (auth, roles, guidance, sensors, sessions, layouts, analytics, WebSocket)
```

`npm run lint` runs oxlint. The smoke test switches the traffic simulator off itself (re-enable it in Settings → Simulator).

---

## Project structure

```
client/            React 19 + Tailwind control room and driver kiosk (lazy-loaded pages)
server/
  index.js         Express + WebSocket entry, serves dist/ in production
  db.js            SQLite schema + demo seed (data in server/data/, git-ignored)
  sqlite.js        small wrapper over node:sqlite (no native build)
  guidance.js      bay selection, holds, laser assignment
  parking.js       one place for park / leave / fee / alerts
  layoutPlans.js   adaptive layout definitions   layoutEngine.js applies them
  simulator.js     demo traffic that uses the real guidance flow
  routes/          REST routes
firmware/          ESP32 reference sketches
scripts/           smoke-test.mjs
```

## Notes & assumptions

* **Demo data:** on first start the database is seeded with a 102-bay lot, 24 h of sample sessions and occupancy history so charts are not empty. Delete `server/data/` to reset.
* **"Search time saved"** on the dashboard = the *unguided search time* assumption (`baseline_search_minutes`, default 6 min) minus the measured time guided drivers needed. Set it from your own observations before quoting the number.
* **Capacity gain** compares against a 60-bay fixed car-only lot (the design baseline of this project).
* The WebSocket is unauthenticated (it broadcasts lot state, including number plates shown in the control room). Put the app behind HTTPS and a reverse proxy before exposing it on the internet.
#   M a a r g d a r s h a k  
 