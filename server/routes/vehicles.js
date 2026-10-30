import express from 'express';
import { db } from '../db.js';
import { authenticate, authorize } from '../middleware.js';
import { parkVehicle, freeSlot } from '../parking.js';
import { isReserved } from '../guidance.js';

const router = express.Router();

const csvCell = (v) => {
  let s = String(v ?? '');
  // Neutralise spreadsheet formula injection (=, +, -, @) in user-supplied text.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

// Parking sessions with filters & pagination
router.get('/sessions', authenticate, (req, res) => {
  const { status, type, search, exportCsv } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 20));

  let where = 'WHERE 1=1';
  const params = [];
  if (status) { where += ' AND status = ?'; params.push(status); }
  if (type) { where += ' AND vehicle_type = ?'; params.push(type); }
  if (search) {
    where += ' AND (vehicle_number LIKE ? OR slot_id LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  if (exportCsv === 'true') {
    const rows = db.prepare(`SELECT * FROM sessions ${where} ORDER BY id DESC LIMIT 500`).all(...params);
    const lines = ['ID,Vehicle Number,Type,Slot ID,Entry Time,Exit Time,Duration (Mins),Fee (INR),Status'];
    rows.forEach((r) => lines.push([r.id, csvCell(r.vehicle_number), r.vehicle_type, csvCell(r.slot_id), csvCell(r.entry_time), csvCell(r.exit_time), r.duration_minutes, r.fee, r.status].join(',')));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="maargdarshak_sessions.csv"');
    return res.send(lines.join('\n') + '\n');
  }

  const total = db.prepare(`SELECT count(*) as count FROM sessions ${where}`).get(...params).count;
  const sessions = db.prepare(`SELECT * FROM sessions ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, (page - 1) * limit);

  res.json({ sessions, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
});

// Manual vehicle entry (operator console)
router.post('/entry', authenticate, authorize('admin', 'operator'), (req, res) => {
  const { vehicleNumber, vehicleType = 'car', slotId } = req.body || {};
  if (!vehicleNumber || !String(vehicleNumber).trim()) return res.status(400).json({ error: 'vehicleNumber is required.' });
  if (!['car', 'bike'].includes(vehicleType)) return res.status(400).json({ error: "vehicleType must be 'car' or 'bike'." });

  let target = null;
  if (slotId) {
    target = db.prepare('SELECT * FROM slots WHERE id = ?').get(slotId);
    if (!target || target.status !== 'available') return res.status(400).json({ error: `Slot ${slotId} is not available.` });
    if (target.type !== vehicleType) return res.status(400).json({ error: `Slot ${slotId} is a ${target.type} bay, not ${vehicleType}.` });
  } else {
    target = db.prepare("SELECT * FROM slots WHERE type = ? AND status = 'available' ORDER BY id ASC").all(vehicleType)
      .find((s) => !isReserved(s.id));
  }
  if (!target) return res.status(400).json({ error: `No vacant slots available for ${vehicleType.toUpperCase()}.` });

  try {
    const { slot, vehicleNumber: plate } = parkVehicle({ slotId: target.id, vehicleNumber, vehicleType, source: 'operator' });
    res.json({ success: true, slot, vehicleNumber: plate, slotId: slot.id });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Manual vehicle exit
router.post('/exit', authenticate, authorize('admin', 'operator'), (req, res) => {
  const { slotId, vehicleNumber } = req.body || {};

  let targetSlotId = slotId;
  if (!targetSlotId && vehicleNumber) {
    const s = db.prepare("SELECT slot_id FROM sessions WHERE vehicle_number = ? AND status = 'active' ORDER BY id DESC LIMIT 1")
      .get(String(vehicleNumber).toUpperCase().trim());
    targetSlotId = s?.slot_id;
  }
  if (!targetSlotId) return res.status(404).json({ error: 'No active session or occupied slot found with provided identifier.' });

  const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(targetSlotId);
  if (!slot) return res.status(404).json({ error: `Slot ${targetSlotId} not found.` });
  if (slot.status !== 'occupied') return res.status(400).json({ error: `Slot ${targetSlotId} is not occupied.` });

  try {
    const out = freeSlot({ slotId: targetSlotId, source: 'operator' });
    res.json({ success: true, slot: out.slot, durationMinutes: out.durationMinutes, fee: out.fee });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
