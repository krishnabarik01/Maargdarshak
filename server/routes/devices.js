import express from 'express';
import { db } from '../db.js';
import { broadcast } from '../ws.js';
import { authenticate, authorize } from '../middleware.js';

const router = express.Router();

router.get('/', (req, res) => {
  const devices = db.prepare('SELECT * FROM devices ORDER BY status DESC, id ASC').all();
  res.json(devices);
});

router.patch('/:id', authenticate, authorize('admin', 'operator'), (req, res) => {
  const { id } = req.params;
  const { action, status } = req.body || {};

  const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
  if (!device) {
    return res.status(404).json({ error: `Device ${id} not found.` });
  }

  if (action === 'mark_maintained') {
    db.prepare("UPDATE devices SET status = 'online', last_seen = ?, battery = 100 WHERE id = ?").run(new Date().toISOString(), id);
  } else if (action === 'acknowledge_fault') {
    // Acknowledge and resolve related alerts
    db.prepare("UPDATE alerts SET status = 'acknowledged' WHERE source = ? AND status = 'active'").run(id);
  } else if (status) {
    if (!['online', 'offline', 'faulty'].includes(status)) {
      return res.status(400).json({ error: "status must be 'online', 'offline' or 'faulty'." });
    }
    db.prepare('UPDATE devices SET status = ? WHERE id = ?').run(status, id);
  }

  const updated = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
  broadcast('device.status', updated);

  res.json({ success: true, device: updated });
});

export default router;
