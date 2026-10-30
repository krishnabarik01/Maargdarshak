import express from 'express';
import { db } from '../db.js';
import { broadcast } from '../ws.js';
import { authenticate, authorize } from '../middleware.js';
import { parkVehicle, freeSlot } from '../parking.js';
import { isReserved, resolveGuidance } from '../guidance.js';

const router = express.Router();

const withReserved = (s) => ({ ...s, reserved: isReserved(s.id) });

// All slots with optional filters
router.get('/', (req, res) => {
  const { zone, type, status, search } = req.query;
  let query = 'SELECT * FROM slots WHERE 1=1';
  const params = [];

  if (zone) { query += ' AND zone = ?'; params.push(zone); }
  if (type) { query += ' AND type = ?'; params.push(type); }
  if (status) { query += ' AND status = ?'; params.push(status); }
  if (search) {
    query += ' AND (id LIKE ? OR current_vehicle LIKE ? OR sensor_id LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY id ASC';
  res.json(db.prepare(query).all(...params).map(withReserved));
});

// Complete lot snapshot
router.get('/state', (req, res) => {
  const slots = db.prepare('SELECT * FROM slots ORDER BY id ASC').all().map(withReserved);
  const layout = db.prepare('SELECT * FROM layout_state WHERE id = 1').get();

  const total = slots.length;
  const occupied = slots.filter((s) => s.status === 'occupied').length;
  const available = slots.filter((s) => s.status === 'available').length;
  const blocked = slots.filter((s) => s.status === 'blocked').length;
  const reserved = slots.filter((s) => s.status === 'available' && s.reserved).length;

  res.json({
    summary: {
      total,
      occupied,
      available,
      blocked,
      reserved,
      cars: slots.filter((s) => s.type === 'car').length,
      bikes: slots.filter((s) => s.type === 'bike').length,
      evSlots: slots.filter((s) => s.is_ev === 1).length,
      occupancyRate: total > 0 ? Math.round((occupied / total) * 100) : 0,
      activeMode: layout.current_mode,
      capacityGainPercent: layout.capacity_gain_percent,
    },
    slots,
  });
});

// Update slot status, flags, or run an action (force_free | block | unblock)
router.patch('/:id', authenticate, authorize('admin', 'operator'), (req, res) => {
  const { id } = req.params;
  const { status, is_ev, is_accessible, action } = req.body || {};

  const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(id);
  if (!slot) return res.status(404).json({ error: `Slot ${id} not found.` });
  if (status && !['available', 'occupied', 'blocked'].includes(status)) {
    return res.status(400).json({ error: "status must be one of 'available', 'occupied', 'blocked'." });
  }

  try {
    const wantFree = action === 'force_free' || status === 'available';
    const wantBlock = action === 'block' || status === 'blocked';
    const wantUnblock = action === 'unblock';
    const wantOccupy = status === 'occupied';

    if (wantFree && slot.status === 'occupied') {
      freeSlot({ slotId: id, source: 'operator' });
    } else if (wantBlock && slot.status !== 'blocked') {
      if (slot.status === 'occupied') freeSlot({ slotId: id, source: 'operator-block' });
      resolveGuidance(id, 'cancelled');
      db.prepare("UPDATE slots SET status = 'blocked', current_vehicle = NULL, occupied_since = NULL WHERE id = ?").run(id);
      db.prepare('INSERT INTO event_logs (event_type, message) VALUES (?, ?)').run('slot', `Slot ${id} marked BLOCKED by operator`);
    } else if ((wantUnblock || wantFree) && slot.status === 'blocked') {
      db.prepare("UPDATE slots SET status = 'available' WHERE id = ?").run(id);
      db.prepare('INSERT INTO event_logs (event_type, message) VALUES (?, ?)').run('slot', `Slot ${id} unblocked`);
    } else if (wantOccupy && slot.status === 'available') {
      parkVehicle({ slotId: id, source: 'operator' });
    }

    if (typeof is_ev === 'boolean' || is_ev === 0 || is_ev === 1) {
      db.prepare('UPDATE slots SET is_ev = ? WHERE id = ?').run(is_ev ? 1 : 0, id);
    }
    if (typeof is_accessible === 'boolean' || is_accessible === 0 || is_accessible === 1) {
      db.prepare('UPDATE slots SET is_accessible = ? WHERE id = ?').run(is_accessible ? 1 : 0, id);
    }
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const updated = db.prepare('SELECT * FROM slots WHERE id = ?').get(id);
  broadcast('slot.updated', updated);
  res.json({ success: true, slot: updated });
});

// Add a new slot (admin)
router.post('/', authenticate, authorize('admin'), (req, res) => {
  const { id, zone, type, is_ev, is_accessible, x, y, w, h } = req.body || {};
  if (!id || !zone || !type) return res.status(400).json({ error: 'id, zone, and type are required.' });
  if (!/^[A-Za-z0-9_-]{1,12}$/.test(id)) return res.status(400).json({ error: 'id may only contain letters, digits, - and _ (max 12).' });
  if (!['car', 'bike'].includes(type)) return res.status(400).json({ error: "type must be 'car' or 'bike'." });

  if (db.prepare('SELECT id FROM slots WHERE id = ?').get(id)) {
    return res.status(400).json({ error: `Slot ${id} already exists.` });
  }

  db.prepare(`
    INSERT INTO slots (id, zone, type, status, is_ev, is_accessible, is_adaptive, sensor_id, x, y, w, h)
    VALUES (?, ?, ?, 'available', ?, ?, 0, ?, ?, ?, ?, ?)
  `).run(id, zone, type, is_ev ? 1 : 0, is_accessible ? 1 : 0, `US-${id}`, Number(x) || 100, Number(y) || 100, Number(w) || 36, Number(h) || 60);

  const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(id);
  broadcast('slot.updated', slot);
  res.status(201).json(slot);
});

// Remove a slot (admin)
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const { id } = req.params;
  const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(id);
  if (!slot) return res.status(404).json({ error: `Slot ${id} not found.` });

  if (slot.status === 'occupied') freeSlot({ slotId: id, source: 'slot-removed' });
  resolveGuidance(id, 'cancelled');
  db.prepare('DELETE FROM slots WHERE id = ?').run(id);
  broadcast('lot.state', { deletedSlotId: id });
  res.json({ success: true, message: `Slot ${id} deleted.` });
});

export default router;
