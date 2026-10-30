import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDatabase } from './sqlite.js';
import { adaptiveSlotSpecs, planSummary } from './layoutPlans.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'maargdarshak.db');
export const db = openDatabase(dbPath);

// All timestamps are stored as ISO-8601 UTC strings so the browser parses them correctly.
export const NOW = "strftime('%Y-%m-%dT%H:%M:%SZ','now')";
export const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'operator', 'viewer')),
      created_at TEXT DEFAULT (${NOW})
    );

    CREATE TABLE IF NOT EXISTS slots (
      id TEXT PRIMARY KEY,
      zone TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('car', 'bike')),
      status TEXT NOT NULL CHECK(status IN ('available', 'occupied', 'blocked')),
      is_ev INTEGER DEFAULT 0,
      is_accessible INTEGER DEFAULT 0,
      is_adaptive INTEGER DEFAULT 0,
      current_vehicle TEXT,
      occupied_since TEXT,
      sensor_id TEXT,
      x REAL NOT NULL,
      y REAL NOT NULL,
      w REAL NOT NULL,
      h REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_number TEXT NOT NULL,
      vehicle_type TEXT NOT NULL,
      slot_id TEXT NOT NULL,
      entry_time TEXT NOT NULL,
      exit_time TEXT,
      duration_minutes INTEGER DEFAULT 0,
      fee REAL DEFAULT 0.0,
      status TEXT NOT NULL CHECK(status IN ('active', 'completed'))
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_slot_status ON sessions(slot_id, status);
    CREATE INDEX IF NOT EXISTS idx_sessions_entry ON sessions(entry_time);

    CREATE TABLE IF NOT EXISTS lasers (
      id TEXT PRIMARY KEY,
      zone TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('online', 'standby', 'active', 'fault')),
      intensity INTEGER DEFAULT 80,
      pulse_mode INTEGER DEFAULT 0,
      mode TEXT DEFAULT 'guidance' CHECK(mode IN ('guidance', 'calibration', 'test', 'disabled')),
      target_slot TEXT,
      last_ping TEXT DEFAULT (${NOW})
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      zone TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('online', 'offline', 'faulty')),
      battery INTEGER DEFAULT 100,
      signal_strength INTEGER DEFAULT -65,
      last_seen TEXT DEFAULT (${NOW}),
      firmware_version TEXT DEFAULT 'v2.4.1'
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      severity TEXT NOT NULL CHECK(severity IN ('critical', 'warning', 'info')),
      source TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active', 'acknowledged', 'resolved')),
      created_at TEXT DEFAULT (${NOW}),
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS layout_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      current_mode TEXT DEFAULT 'balanced',
      demand_ratio_bike INTEGER DEFAULT 65,
      capacity_gain_percent INTEGER DEFAULT 45,
      transitioning INTEGER DEFAULT 0,
      transition_progress INTEGER DEFAULT 100,
      last_changed TEXT DEFAULT (${NOW})
    );

    CREATE TABLE IF NOT EXISTS layout_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_mode TEXT NOT NULL,
      to_mode TEXT NOT NULL,
      reason TEXT NOT NULL,
      capacity_before INTEGER NOT NULL,
      capacity_after INTEGER NOT NULL,
      timestamp TEXT DEFAULT (${NOW})
    );

    CREATE TABLE IF NOT EXISTS layout_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      days TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      mode TEXT NOT NULL,
      enabled INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS guidance_rules (
      rule_key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      zone TEXT DEFAULT 'All Zones'
    );

    CREATE TABLE IF NOT EXISTS guidance_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket TEXT NOT NULL,
      slot_id TEXT NOT NULL,
      laser_id TEXT,
      vehicle_type TEXT NOT NULL,
      vehicle_number TEXT,
      distance_m REAL,
      requested_at TEXT NOT NULL,
      resolved_at TEXT,
      outcome TEXT NOT NULL DEFAULT 'pending' CHECK(outcome IN ('pending', 'arrived', 'expired', 'cancelled'))
    );

    CREATE TABLE IF NOT EXISTS occupancy_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      total INTEGER NOT NULL,
      occupied INTEGER NOT NULL,
      cars INTEGER NOT NULL,
      bikes INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_snapshots_ts ON occupancy_snapshots(ts);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS event_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT DEFAULT (${NOW})
    );
  `);

  if (db.prepare('SELECT COUNT(*) as count FROM users').get().count === 0) {
    const salt = bcrypt.genSaltSync(10);
    const hash = (pwd) => bcrypt.hashSync(pwd, salt);
    const insertUser = db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)');
    insertUser.run('Admin Operator', 'admin@maargdarshak.in', hash('admin123'), 'admin');
    insertUser.run('Shift Operator', 'operator@maargdarshak.in', hash('operator123'), 'operator');
    insertUser.run('Field Viewer', 'viewer@maargdarshak.in', hash('viewer123'), 'viewer');
  }

  if (db.prepare('SELECT COUNT(*) as count FROM layout_state').get().count === 0) {
    db.prepare('INSERT INTO layout_state (id, current_mode, demand_ratio_bike, capacity_gain_percent, transitioning, transition_progress) VALUES (1, ?, ?, ?, 0, 100)')
      .run('balanced', 65, planSummary('balanced').capacityGainPercent);

    db.prepare(`
      INSERT INTO layout_schedule (days, start_time, end_time, mode, enabled) VALUES
      ('Mon, Tue, Wed, Thu, Fri', '08:00', '11:30', '2w-peak', 1),
      ('Sat, Sun', '16:00', '22:00', 'car-peak', 1),
      ('Mon, Tue, Wed, Thu, Fri', '12:00', '16:00', 'balanced', 1)
    `).run();

    const insertHist = db.prepare('INSERT INTO layout_history (from_mode, to_mode, reason, capacity_before, capacity_after, timestamp) VALUES (?, ?, ?, ?, ?, ?)');
    insertHist.run('car-peak', 'balanced', 'Demand engine shift', 72, 98, ago(120));
    insertHist.run('balanced', '2w-peak', 'Morning commute influx', 98, 128, ago(300));
    insertHist.run('2w-peak', 'balanced', 'Automated daily schedule', 128, 98, ago(1440));
  }

  if (db.prepare('SELECT COUNT(*) as count FROM guidance_rules').get().count === 0) {
    const insertRule = db.prepare('INSERT INTO guidance_rules (rule_key, name, enabled, zone) VALUES (?, ?, ?, ?)');
    insertRule.run('ev_priority', 'EV Priority Charging Guidance', 1, 'Zone A');
    insertRule.run('accessible', 'Accessibility (Divyangjan) Priority', 1, 'Zone A');
    insertRule.run('no_entry', 'Dynamic No-Entry Hazard Barrier', 0, 'Zone B');
    insertRule.run('priority_corridors', 'Emergency Clear Corridor', 1, 'All Zones');
  }

  if (db.prepare('SELECT COUNT(*) as count FROM settings').get().count === 0) {
    const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    insertSetting.run('lot_name', 'Maargdarshak — North Terminal Lot 01');
    insertSetting.run('car_rate_hourly', '40');
    insertSetting.run('bike_rate_hourly', '15');
    insertSetting.run('free_minutes', '15');
    insertSetting.run('simulator_enabled', 'true');
    insertSetting.run('simulator_interval_sec', '4');
    insertSetting.run('api_key', 'maargdarshak-sensor-key-2026');
    insertSetting.run('baseline_search_minutes', '6');
    insertSetting.run('guidance_hold_seconds', '120');
  }
  // Settings added in later versions: make sure existing databases get them too.
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('baseline_search_minutes', '6')").run();
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('guidance_hold_seconds', '120')").run();

  if (db.prepare('SELECT COUNT(*) as count FROM slots').get().count === 0) seedSlots();
  if (db.prepare('SELECT COUNT(*) as count FROM lasers').get().count === 0) seedLasersAndDevices();
  if (db.prepare('SELECT COUNT(*) as count FROM alerts').get().count === 0) seedAlerts();
  if (db.prepare('SELECT COUNT(*) as count FROM sessions').get().count <= db.prepare("SELECT COUNT(*) as count FROM sessions WHERE status = 'active'").get().count) seedSessions();
  if (db.prepare('SELECT COUNT(*) as count FROM occupancy_snapshots').get().count === 0) seedSnapshots();
}

export function getSetting(key, fallback = null) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? fallback;
}

function seedSlots() {
  const insertSlot = db.prepare(`
    INSERT INTO slots (id, zone, type, status, is_ev, is_accessible, is_adaptive, current_vehicle, occupied_since, sensor_id, x, y, w, h)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSession = db.prepare("INSERT INTO sessions (vehicle_number, vehicle_type, slot_id, entry_time, status) VALUES (?, ?, ?, ?, 'active')");

  const add = (id, zone, type, occ, ev, acc, adaptive, plate, minutesAgo, x, y, w, h) => {
    const since = occ ? ago(minutesAgo) : null;
    insertSlot.run(id, zone, type, occ ? 'occupied' : 'available', ev, acc, adaptive, occ ? plate : null, since, `US-${id}`, x, y, w, h);
    if (occ) insertSession.run(plate, type, id, since);
  };

  const plates = ['KA-01-AB-1234', 'MH-12-PQ-9081', 'DL-04-CK-5521', 'HR-26-EE-9912', 'TN-07-BB-4102', 'TS-09-FA-8811', 'UP-16-DD-3312'];

  db.transaction(() => {
    // Zone A: fixed car + EV bays (A01-A30)
    for (let i = 1; i <= 30; i++) {
      const col = (i - 1) % 15;
      const row = Math.floor((i - 1) / 15);
      add(`A${String(i).padStart(2, '0')}`, 'Zone A', 'car', i % 3 === 0, i <= 6 ? 1 : 0, i === 7 || i === 8 ? 1 : 0, 0,
        plates[i % plates.length], i * 12, 50 + col * 42, 60 + row * 80, 36, 60);
    }
    // Zone B: adaptive canvas, seeded in the default 'balanced' layout (12 car + 30 two-wheeler bays)
    adaptiveSlotSpecs('balanced').forEach((b, i) => {
      add(b.id, 'Zone B', b.type, (i + 1) % 2 === 0, b.is_ev, 0, 1,
        b.type === 'bike' ? `KA-05-BK-${1000 + i}` : `KA-01-CR-${3000 + i}`, (i + 1) * 7, b.x, b.y, b.w, b.h);
    });
    // Zone C: standard car bays (C01-C30)
    for (let i = 1; i <= 30; i++) {
      const col = (i - 1) % 15;
      const row = Math.floor((i - 1) / 15);
      add(`C${String(i).padStart(2, '0')}`, 'Zone C', 'car', (i + 1) % 4 === 0, 0, i === 1 ? 1 : 0, 0,
        `DL-03-CR-${2000 + i}`, i * 15, 50 + col * 42, 430 + row * 80, 36, 60);
    }
  })();
}

function seedLasersAndDevices() {
  const insertLaser = db.prepare('INSERT INTO lasers (id, zone, status, intensity, pulse_mode, mode, target_slot, last_ping) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const insertDevice = db.prepare('INSERT OR IGNORE INTO devices (id, type, zone, status, battery, signal_strength, last_seen, firmware_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const now = new Date().toISOString();

  db.transaction(() => {
    // 8 laser guidance units (LZ-05 is seeded as faulty to demonstrate fault handling)
    for (let i = 1; i <= 8; i++) {
      const id = `LZ-0${i}`;
      const zone = i <= 2 ? 'Zone A' : i <= 6 ? 'Zone B' : 'Zone C';
      const fault = i === 5;
      insertLaser.run(id, zone, fault ? 'fault' : 'online', 85, 0, 'guidance', null, now);
      insertDevice.run(id, 'galvo_projector', zone, fault ? 'faulty' : 'online', 100, -58, now, 'v2.4.1');
    }

    // ESP32 controllers
    insertDevice.run('ESP32-CORE-ZA', 'mcu', 'Zone A', 'online', 100, -52, now, 'v2.4.1');
    insertDevice.run('ESP32-CORE-ZB', 'mcu', 'Zone B', 'online', 100, -48, now, 'v2.4.1');
    insertDevice.run('ESP32-CORE-ZC', 'mcu', 'Zone C', 'online', 100, -56, now, 'v2.4.1');
    insertDevice.run('ESP32-GATE-IN', 'mcu', 'Perimeter', 'online', 100, -45, now, 'v2.4.1');
    insertDevice.run('ESP32-GATE-OUT', 'mcu', 'Perimeter', 'online', 100, -50, now, 'v2.4.1');

    // One ultrasonic sensor per seeded slot
    const slots = db.prepare('SELECT id, zone, sensor_id FROM slots ORDER BY id').all();
    slots.forEach((s, i) => {
      const status = s.id === 'A14' ? 'offline' : s.id === 'A22' ? 'faulty' : 'online';
      insertDevice.run(s.sensor_id, 'ultrasonic', s.zone, status, 92 - (i % 20), -62 - (i % 15), now, 'v1.8.0');
    });
  })();
}

function seedAlerts() {
  const insertAlert = db.prepare('INSERT INTO alerts (severity, source, message, status, created_at) VALUES (?, ?, ?, ?, ?)');
  insertAlert.run('critical', 'LZ-05', 'Galvo mirror deflection error: motor stalled on X-axis', 'active', ago(12));
  insertAlert.run('warning', 'US-A14', 'Ultrasonic sensor: no heartbeat for more than 15 minutes', 'active', ago(28));
  insertAlert.run('warning', 'Lot Capacity', 'Zone B two-wheeler occupancy surpassed 85%', 'active', ago(45));
  insertAlert.run('info', 'Demand Engine', 'Demand shift detected: +18% two-wheeler influx', 'acknowledged', ago(60));
  insertAlert.run('info', 'ESP32-GATE-IN', 'Boom barrier cycle count verified: 1,420 cycles', 'resolved', ago(180));
}

// Demo history spread across the last 24h with a realistic commuter curve.
function seedSessions() {
  const insertSession = db.prepare(`
    INSERT INTO sessions (vehicle_number, vehicle_type, slot_id, entry_time, exit_time, duration_minutes, fee, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'completed')
  `);
  const curve = [1, 1, 1, 1, 2, 3, 6, 12, 18, 16, 12, 11, 13, 12, 10, 11, 14, 16, 14, 9, 6, 4, 2, 1]; // by hour
  let n = 0;
  db.transaction(() => {
    for (let h = 1; h <= 24; h++) {
      const start = new Date(Date.now() - h * 3600000);
      const weight = curve[start.getHours()];
      for (let k = 0; k < weight; k++) {
        n++;
        const isCar = n % 3 === 0;
        const entry = new Date(start.getTime() + (k * 3600000) / weight);
        const mins = 20 + ((n * 37) % 180);
        const exit = new Date(entry.getTime() + mins * 60000);
        if (exit.getTime() > Date.now()) continue;
        const rate = isCar ? 40 : 15;
        const fee = mins <= 15 ? 0 : Math.ceil((mins / 60) * rate);
        const slot = isCar ? `A${String((n % 25) + 1).padStart(2, '0')}` : `B${String((n % 50) + 1).padStart(2, '0')}`;
        const plate = `${['KA', 'MH', 'DL', 'TN', 'HR'][n % 5]}-${10 + (n % 80)}-${String.fromCharCode(65 + (n % 26))}${String.fromCharCode(65 + ((n * 7) % 26))}-${1000 + ((n * 131) % 8999)}`;
        insertSession.run(plate, isCar ? 'car' : 'bike', slot, entry.toISOString(), exit.toISOString(), mins, fee);
      }
    }
  })();
}

function seedSnapshots() {
  const total = db.prepare('SELECT count(*) as c FROM slots').get().c;
  const curve = [18, 15, 14, 14, 18, 28, 45, 68, 82, 76, 64, 60, 66, 62, 58, 62, 72, 84, 78, 60, 44, 32, 24, 20];
  const insert = db.prepare('INSERT INTO occupancy_snapshots (ts, total, occupied, cars, bikes) VALUES (?, ?, ?, ?, ?)');
  db.transaction(() => {
    for (let h = 24; h >= 1; h--) {
      const t = new Date(Date.now() - h * 3600000);
      const pct = curve[t.getHours()];
      const occ = Math.round((total * pct) / 100);
      insert.run(t.toISOString(), total, occ, Math.round(occ * 0.4), occ - Math.round(occ * 0.4));
    }
  })();
}

export function recordSnapshot() {
  const row = db.prepare(`
    SELECT count(*) as total,
           coalesce(sum(status = 'occupied'), 0) as occupied,
           coalesce(sum(status = 'occupied' AND type = 'car'), 0) as cars,
           coalesce(sum(status = 'occupied' AND type = 'bike'), 0) as bikes
    FROM slots
  `).get();
  db.prepare('INSERT INTO occupancy_snapshots (ts, total, occupied, cars, bikes) VALUES (?, ?, ?, ?, ?)')
    .run(new Date().toISOString(), row.total, row.occupied, row.cars, row.bikes);
  db.prepare('DELETE FROM occupancy_snapshots WHERE ts < ?').run(ago(60 * 24 * 7));
}
