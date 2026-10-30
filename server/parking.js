// Single place where a vehicle parks / leaves, so API routes, hardware sensors and the
// simulator all follow exactly the same rules (sessions, fees, logs, lasers, alerts, broadcasts).
import { db, getSetting } from './db.js';
import { broadcast } from './ws.js';
import { getReservation, resolveGuidance } from './guidance.js';

export function computeFee(minutes, vehicleType) {
  const rate = parseInt(getSetting(vehicleType === 'bike' ? 'bike_rate_hourly' : 'car_rate_hourly', vehicleType === 'bike' ? '15' : '40'), 10);
  const free = parseInt(getSetting('free_minutes', '15'), 10) || 0;
  if (minutes <= free) return 0;
  return Math.ceil((minutes / 60) * rate);
}

export function raiseAlert(severity, source, message) {
  const existing = db.prepare("SELECT id FROM alerts WHERE source = ? AND message = ? AND status = 'active'").get(source, message);
  if (existing) return null;
  const info = db.prepare("INSERT INTO alerts (severity, source, message, status, created_at) VALUES (?, ?, ?, 'active', ?)")
    .run(severity, source, message, new Date().toISOString());
  const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(info.lastInsertRowid);
  const unreadCount = db.prepare("SELECT count(*) as count FROM alerts WHERE status = 'active'").get().count;
  broadcast('alert.updated', { alert, unreadCount });
  return alert;
}

function checkCapacityAlert(zone) {
  const z = db.prepare("SELECT count(*) as total, sum(status = 'occupied') as occ FROM slots WHERE zone = ?").get(zone);
  if (z.total > 0 && z.occ / z.total >= 0.9) {
    raiseAlert('warning', 'Lot Capacity', `${zone} occupancy is above 90% (${z.occ}/${z.total})`);
  }
}

/**
 * Mark a slot occupied and open a parking session.
 * Returns { slot, vehicleNumber } or throws an Error with `.status` for the HTTP layer.
 */
export function parkVehicle({ slotId, vehicleNumber, vehicleType, source = 'manual' }) {
  const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(slotId);
  if (!slot) throw Object.assign(new Error(`Slot ${slotId} not found.`), { status: 404 });
  if (slot.status === 'occupied') throw Object.assign(new Error(`Slot ${slotId} is already occupied.`), { status: 409 });
  if (slot.status === 'blocked') throw Object.assign(new Error(`Slot ${slotId} is blocked.`), { status: 409 });

  const reservation = getReservation(slotId);
  const plate = (vehicleNumber || reservation?.vehicleNumber || 'UNIDENTIFIED').toUpperCase().trim();
  const type = vehicleType || slot.type;
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare("UPDATE slots SET status = 'occupied', current_vehicle = ?, occupied_since = ? WHERE id = ?").run(plate, now, slotId);
    // Close any stale open session on this slot before opening a new one.
    db.prepare("UPDATE sessions SET status = 'completed', exit_time = ?, duration_minutes = 0, fee = 0 WHERE slot_id = ? AND status = 'active'").run(now, slotId);
    db.prepare("INSERT INTO sessions (vehicle_number, vehicle_type, slot_id, entry_time, status) VALUES (?, ?, ?, ?, 'active')").run(plate, type, slotId, now);
    db.prepare('INSERT INTO event_logs (event_type, message) VALUES (?, ?)')
      .run('entry', `Vehicle ${plate} (${type.toUpperCase()}) parked at ${slotId} [${source}]`);
  })();

  resolveGuidance(slotId, 'arrived'); // releases the laser

  const updated = db.prepare('SELECT * FROM slots WHERE id = ?').get(slotId);
  broadcast('vehicle.entered', { vehicleNumber: plate, vehicleType: type, slotId, zone: slot.zone, entryTime: now, source });
  broadcast('slot.updated', updated);
  checkCapacityAlert(slot.zone);
  return { slot: updated, vehicleNumber: plate };
}

/** Free a slot, close its session and compute the fee. Returns null when nothing was parked. */
export function freeSlot({ slotId, source = 'manual' }) {
  const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(slotId);
  if (!slot) throw Object.assign(new Error(`Slot ${slotId} not found.`), { status: 404 });

  const session = db.prepare("SELECT * FROM sessions WHERE slot_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1").get(slotId);
  const exitTime = new Date().toISOString();
  const minutes = session ? Math.max(1, Math.round((Date.now() - new Date(session.entry_time).getTime()) / 60000)) : 0;
  const type = session?.vehicle_type || slot.type;
  const fee = session ? computeFee(minutes, type) : 0;
  const plate = session?.vehicle_number || slot.current_vehicle || 'UNKNOWN';

  db.transaction(() => {
    db.prepare("UPDATE slots SET status = 'available', current_vehicle = NULL, occupied_since = NULL WHERE id = ?").run(slotId);
    if (session) {
      db.prepare("UPDATE sessions SET status = 'completed', exit_time = ?, duration_minutes = ?, fee = ? WHERE id = ?")
        .run(exitTime, minutes, fee, session.id);
    }
    db.prepare('INSERT INTO event_logs (event_type, message) VALUES (?, ?)')
      .run('exit', `Vehicle ${plate} left ${slotId} after ${minutes} min. Fee: ₹${fee} [${source}]`);
  })();

  const updated = db.prepare('SELECT * FROM slots WHERE id = ?').get(slotId);
  broadcast('vehicle.exited', { slotId, vehicleNumber: plate, durationMinutes: minutes, fee });
  broadcast('slot.updated', updated);
  return { slot: updated, durationMinutes: minutes, fee, vehicleNumber: plate };
}
