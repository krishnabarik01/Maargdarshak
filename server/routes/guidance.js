import express from 'express';
import { rateLimit } from '../middleware.js';
import {
  GATE, PX_PER_METER, requestGuidance, listActiveGuidance, cancelGuidanceByTicket,
} from '../guidance.js';
import { db } from '../db.js';

const router = express.Router();

// Public: used by the gate kiosk / driver page. Limited so nobody can hoard slots.
const limiter = rateLimit({ windowMs: 60_000, max: 12, message: 'Too many guidance requests. Please wait a minute.' });
const MAX_ACTIVE = 10;

router.post('/request', limiter, (req, res) => {
  if (listActiveGuidance().length >= MAX_ACTIVE) {
    return res.status(429).json({ error: 'Gate is busy, please try again in a few seconds.' });
  }
  const { vehicleType, vehicleNumber, needsEv, needsAccessible } = req.body || {};
  const result = requestGuidance({
    vehicleType: vehicleType || 'car',
    vehicleNumber,
    needsEv: needsEv === true,
    needsAccessible: needsAccessible === true,
  });
  if (!result.ok) return res.status(result.code).json({ error: result.error });
  res.status(201).json({ success: true, guidance: result.guidance, gate: GATE, pxPerMeter: PX_PER_METER });
});

router.get('/active', (req, res) => {
  res.json({ gate: GATE, pxPerMeter: PX_PER_METER, active: listActiveGuidance() });
});

router.delete('/:ticket', limiter, (req, res) => {
  const r = cancelGuidanceByTicket(req.params.ticket);
  if (!r) return res.status(404).json({ error: 'Guidance ticket not found or already finished.' });
  res.json({ success: true });
});

// Aggregate numbers used on the dashboard.
router.get('/stats', (req, res) => {
  const s = db.prepare(`
    SELECT count(*) as total,
           coalesce(sum(outcome = 'arrived'), 0) as arrived,
           coalesce(sum(outcome = 'expired'), 0) as expired,
           coalesce(sum(outcome = 'cancelled'), 0) as cancelled,
           coalesce(avg(distance_m), 0) as avgDistance
    FROM guidance_log
  `).get();
  res.json({ ...s, avgDistance: Math.round(s.avgDistance * 10) / 10, active: listActiveGuidance().length });
});

export default router;
