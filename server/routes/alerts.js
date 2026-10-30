import express from 'express';
import { db } from '../db.js';
import { broadcast } from '../ws.js';
import { authenticate, authorize } from '../middleware.js';

const router = express.Router();

router.get('/', (req, res) => {
  const alerts = db.prepare('SELECT * FROM alerts ORDER BY id DESC LIMIT 50').all();
  const unreadCount = db.prepare("SELECT count(*) as count FROM alerts WHERE status = 'active'").get().count;
  res.json({ alerts, unreadCount });
});

router.patch('/:id', authenticate, authorize('admin', 'operator'), (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'acknowledged' | 'resolved'

  if (!['acknowledged', 'resolved'].includes(status)) {
    return res.status(400).json({ error: 'status must be acknowledged or resolved.' });
  }

  const resolvedAt = status === 'resolved' ? new Date().toISOString() : null;

  db.prepare('UPDATE alerts SET status = ?, resolved_at = COALESCE(?, resolved_at) WHERE id = ?')
    .run(status, resolvedAt, id);

  const updated = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
  const unreadCount = db.prepare("SELECT count(*) as count FROM alerts WHERE status = 'active'").get().count;

  broadcast('alert.updated', { alert: updated, unreadCount });

  res.json({ success: true, alert: updated, unreadCount });
});

export default router;
