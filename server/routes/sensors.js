import express from 'express';
import { db } from '../db.js';
import { broadcast } from '../ws.js';
import { apiKeyAuth } from '../middleware.js';
import { parkVehicle, freeSlot } from '../parking.js';

const router = express.Router();

/** Apply one reading. Returns a plain result object (used by both single and batch endpoints). */
function applyReading({ sensorId, occupied, distanceCm, battery, rssi, firmware }) {
  const slot = db.prepare('SELECT * FROM slots WHERE sensor_id = ? OR id = ?').get(sensorId, sensorId);
  if (!slot) return { ok: false, status: 404, error: `No slot mapped to sensor ID '${sensorId}'.` };

  // Heartbeat: every reading proves the node is alive (auto-register unknown sensors).
  db.prepare(`
    INSERT INTO devices (id, type, zone, status, battery, signal_strength, last_seen, firmware_version)
    VALUES (?, 'ultrasonic', ?, 'online', ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = 'online',
      last_seen = excluded.last_seen,
      battery = COALESCE(?, devices.battery),
      signal_strength = COALESCE(?, devices.signal_strength),
      firmware_version = COALESCE(?, devices.firmware_version)
  `).run(slot.sensor_id || sensorId, slot.zone, battery ?? 100, rssi ?? -65, new Date().toISOString(), firmware ?? 'v1.8.0',
    battery ?? null, rssi ?? null, firmware ?? null);

  let changed = false;
  let current = slot;

  if (slot.status === 'blocked') {
    return { ok: true, sensorId, slotId: slot.id, status: 'blocked', changed: false, note: 'Slot is blocked by an operator; reading ignored.' };
  }

  if (occupied && slot.status === 'available') {
    current = parkVehicle({ slotId: slot.id, source: 'sensor' }).slot;
    changed = true;
  } else if (!occupied && slot.status === 'occupied') {
    current = freeSlot({ slotId: slot.id, source: 'sensor' }).slot;
    changed = true;
  }

  return { ok: true, sensorId, slotId: slot.id, status: current.status, changed, distanceCm: distanceCm ?? null };
}

// Called by every ESP32 / Arduino slot node.
router.post('/reading', apiKeyAuth, (req, res) => {
  const { sensorId, occupied, distanceCm, battery, rssi, firmware } = req.body || {};
  if (!sensorId || typeof occupied !== 'boolean') {
    return res.status(400).json({ error: 'sensorId (string) and occupied (boolean) are required.' });
  }
  const result = applyReading({ sensorId: String(sensorId), occupied, distanceCm, battery, rssi, firmware });
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ success: true, ...result, timestamp: new Date().toISOString() });
});

// One gateway can report many sensors in a single request (saves Wi-Fi airtime).
router.post('/batch', apiKeyAuth, (req, res) => {
  const readings = req.body?.readings;
  if (!Array.isArray(readings) || readings.length === 0 || readings.length > 200) {
    return res.status(400).json({ error: 'readings must be an array of 1-200 items.' });
  }
  const results = readings.map((r) =>
    typeof r?.sensorId === 'string' && typeof r?.occupied === 'boolean'
      ? applyReading(r)
      : { ok: false, status: 400, error: 'Invalid reading' });
  res.json({ success: true, processed: results.length, results });
});

// Generic hardware heartbeat for laser / gate / controller nodes.
router.post('/heartbeat', apiKeyAuth, (req, res) => {
  const { deviceId, battery, rssi, firmware } = req.body || {};
  if (!deviceId) return res.status(400).json({ error: 'deviceId is required.' });
  const dev = db.prepare('SELECT * FROM devices WHERE id = ?').get(String(deviceId));
  if (!dev) return res.status(404).json({ error: `Unknown device '${deviceId}'.` });
  db.prepare(`
    UPDATE devices SET status = 'online', last_seen = ?, battery = COALESCE(?, battery),
      signal_strength = COALESCE(?, signal_strength), firmware_version = COALESCE(?, firmware_version)
    WHERE id = ?
  `).run(new Date().toISOString(), battery ?? null, rssi ?? null, firmware ?? null, dev.id);
  broadcast('device.status', db.prepare('SELECT * FROM devices WHERE id = ?').get(dev.id));
  res.json({ success: true });
});

export default router;
