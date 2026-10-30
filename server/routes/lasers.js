import express from 'express';
import { db, NOW } from '../db.js';
import { broadcast } from '../ws.js';
import { authenticate, authorize, apiKeyAuth } from '../middleware.js';
import { GATE, PX_PER_METER } from '../guidance.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM lasers ORDER BY id ASC').all());
});

// Polled by the laser controller node (ESP32 + servos / galvo): "where should I point right now?"
router.get('/:id/command', apiKeyAuth, (req, res) => {
  const laser = db.prepare('SELECT * FROM lasers WHERE id = ?').get(req.params.id);
  if (!laser) return res.status(404).json({ error: `Laser unit ${req.params.id} not found.` });

  const slot = laser.target_slot ? db.prepare('SELECT * FROM slots WHERE id = ?').get(laser.target_slot) : null;
  const m = (px) => Math.round((px / PX_PER_METER) * 100) / 100;

  db.prepare(`UPDATE lasers SET last_ping = ${NOW} WHERE id = ?`).run(laser.id);

  res.json({
    laserId: laser.id,
    enabled: laser.mode !== 'disabled' && laser.status !== 'fault',
    mode: laser.mode, // guidance | calibration | test | disabled
    intensity: laser.intensity, // 0-100 (% of the safe, low-power maximum)
    pulse: laser.pulse_mode === 1,
    target: slot
      ? { slotId: slot.id, zone: slot.zone, xMeters: m(slot.x + slot.w / 2), yMeters: m(slot.y + slot.h / 2) }
      : null,
    gate: { xMeters: m(GATE.x), yMeters: m(GATE.y) },
    serverTime: new Date().toISOString(),
  });
});

router.patch('/:id', authenticate, authorize('admin', 'operator'), (req, res) => {
  const { id } = req.params;
  const { intensity, pulse_mode, mode, status } = req.body || {};

  const laser = db.prepare('SELECT * FROM lasers WHERE id = ?').get(id);
  if (!laser) return res.status(404).json({ error: `Laser unit ${id} not found.` });

  db.transaction(() => {
    if (typeof intensity === 'number' && Number.isFinite(intensity)) {
      db.prepare('UPDATE lasers SET intensity = ? WHERE id = ?').run(Math.round(Math.min(100, Math.max(0, intensity))), id);
    }
    if (typeof pulse_mode === 'boolean' || pulse_mode === 0 || pulse_mode === 1) {
      db.prepare('UPDATE lasers SET pulse_mode = ? WHERE id = ?').run(pulse_mode ? 1 : 0, id);
    }
    if (mode && ['guidance', 'calibration', 'test', 'disabled'].includes(mode)) {
      db.prepare('UPDATE lasers SET mode = ? WHERE id = ?').run(mode, id);
    }
    if (status && ['online', 'standby', 'active', 'fault'].includes(status)) {
      db.prepare('UPDATE lasers SET status = ? WHERE id = ?').run(status, id);
    }
  })();

  const updated = db.prepare('SELECT * FROM lasers WHERE id = ?').get(id);
  broadcast('laser.updated', updated);
  res.json({ success: true, laser: updated });
});

router.post('/test-pattern', authenticate, authorize('admin', 'operator'), (req, res) => {
  const { unitId } = req.body || {};
  const affected = unitId
    ? db.prepare("SELECT id FROM lasers WHERE id = ? AND status != 'fault'").all(unitId)
    : db.prepare("SELECT id FROM lasers WHERE status != 'fault' AND mode = 'guidance'").all();

  const ids = affected.map((l) => l.id);
  ids.forEach((id) => db.prepare(`UPDATE lasers SET mode = 'test', last_ping = ${NOW} WHERE id = ?`).run(id));
  broadcast('laser.test_pattern', { active: true, units: ids, timestamp: new Date().toISOString() });

  // Test patterns automatically stop after 15 s and the unit returns to guidance mode.
  setTimeout(() => {
    ids.forEach((id) => {
      db.prepare("UPDATE lasers SET mode = 'guidance' WHERE id = ? AND mode = 'test'").run(id);
      broadcast('laser.updated', db.prepare('SELECT * FROM lasers WHERE id = ?').get(id));
    });
    broadcast('laser.test_pattern', { active: false, units: ids, timestamp: new Date().toISOString() });
  }, 15000).unref();

  res.json({ success: true, message: 'Test pattern active on selected units for 15s.', lasers: db.prepare('SELECT * FROM lasers ORDER BY id ASC').all() });
});

export default router;
