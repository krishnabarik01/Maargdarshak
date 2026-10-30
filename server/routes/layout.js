import express from 'express';
import { db } from '../db.js';
import { broadcast } from '../ws.js';
import { getLayoutState, previewLayout, applyLayout } from '../layoutEngine.js';
import { authenticate, authorize } from '../middleware.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.json(getLayoutState());
});

router.post('/preview', (req, res) => {
  const { mode } = req.body;
  if (!mode) {
    return res.status(400).json({ error: 'mode is required for layout preview.' });
  }
  res.json(previewLayout(mode));
});

router.post('/apply', authenticate, authorize('admin', 'operator'), (req, res) => {
  const { mode, reason } = req.body;
  if (!mode) {
    return res.status(400).json({ error: 'mode is required.' });
  }
  try {
    res.json(applyLayout(mode, reason || `Manual operator change to ${mode}`));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.patch('/rules', authenticate, authorize('admin', 'operator'), (req, res) => {
  const { ruleKey, enabled, zone } = req.body;
  if (!ruleKey) {
    return res.status(400).json({ error: 'ruleKey is required.' });
  }

  db.prepare('UPDATE guidance_rules SET enabled = ?, zone = COALESCE(?, zone) WHERE rule_key = ?')
    .run(enabled ? 1 : 0, zone, ruleKey);

  const updatedRules = db.prepare('SELECT * FROM guidance_rules').all();
  broadcast('guidance_rules.updated', updatedRules);

  res.json({ success: true, rules: updatedRules });
});

router.post('/schedule', authenticate, authorize('admin', 'operator'), (req, res) => {
  const { days, startTime, endTime, mode } = req.body;
  if (!days || !startTime || !endTime || !mode) {
    return res.status(400).json({ error: 'days, startTime, endTime, and mode are required.' });
  }

  db.prepare(`
    INSERT INTO layout_schedule (days, start_time, end_time, mode, enabled)
    VALUES (?, ?, ?, ?, 1)
  `).run(days, startTime, endTime, mode);

  const schedules = db.prepare('SELECT * FROM layout_schedule WHERE enabled = 1').all();
  res.status(201).json(schedules);
});

router.delete('/schedule/:id', authenticate, authorize('admin', 'operator'), (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM layout_schedule WHERE id = ?').run(id);
  res.json({ success: true, message: `Schedule ${id} deleted.` });
});

export default router;
