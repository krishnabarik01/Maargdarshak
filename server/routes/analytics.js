import express from 'express';
import { db, getSetting } from '../db.js';
import { planSummary, FIXED_BASELINE_CAPACITY } from '../layoutPlans.js';

const router = express.Router();

const startOfTodayIso = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

// 12 buckets of 2 hours covering the last 24 hours (oldest first).
function twoHourBuckets() {
  const end = new Date();
  end.setMinutes(0, 0, 0);
  end.setHours(end.getHours() + 1);
  const buckets = [];
  for (let i = 12; i >= 1; i--) {
    const to = new Date(end.getTime() - (i - 1) * 2 * 3600000);
    const from = new Date(to.getTime() - 2 * 3600000);
    buckets.push({ from: from.toISOString(), to: to.toISOString(), label: `${String(from.getHours()).padStart(2, '0')}:00` });
  }
  return buckets;
}

router.get('/kpis', (req, res) => {
  const slots = db.prepare(`
    SELECT count(*) as total,
           coalesce(sum(status = 'occupied'), 0) as occupied,
           coalesce(sum(status = 'available'), 0) as available,
           coalesce(sum(type = 'car'), 0) as cars,
           coalesce(sum(type = 'bike'), 0) as bikes
    FROM slots
  `).get();

  const midnight = startOfTodayIso();
  const entered = db.prepare('SELECT count(*) as count FROM sessions WHERE entry_time >= ?').get(midnight).count;
  const revenue = db.prepare("SELECT coalesce(sum(fee), 0) as revenue FROM sessions WHERE status = 'completed' AND exit_time >= ?").get(midnight).revenue;
  const dwell = db.prepare("SELECT coalesce(avg(duration_minutes), 0) as avg FROM sessions WHERE status = 'completed' AND duration_minutes > 0 AND exit_time >= ?").get(midnight).avg;
  const layout = db.prepare('SELECT * FROM layout_state WHERE id = 1').get();

  // Estimated search time saved per guided vehicle = configured "unguided search time" minus the
  // measured time a driver actually needed to reach the laser-guided slot.
  const baseline = parseFloat(getSetting('baseline_search_minutes', '6')) || 6;
  const guided = db.prepare(`
    SELECT count(*) as n,
           coalesce(avg((julianday(resolved_at) - julianday(requested_at)) * 1440), 0) as avgMin
    FROM guidance_log WHERE outcome = 'arrived'
  `).get();
  const saved = guided.n > 0 ? Math.max(0, baseline - guided.avgMin) : 0;

  res.json({
    available: slots.available,
    occupied: slots.occupied,
    total: slots.total,
    cars: slots.cars,
    bikes: slots.bikes,
    occupancyPercent: slots.total > 0 ? Math.round((slots.occupied / slots.total) * 100) : 0,
    activeMode: layout.current_mode,
    capacityGainPercent: layout.capacity_gain_percent,
    vehiclesEnteredToday: entered,
    revenueToday: revenue,
    avgDwellMinutes: Math.round(dwell),
    avgSearchTimeSavedMin: Math.round(saved * 10) / 10,
    guidedVehicles: guided.n,
  });
});

router.get('/occupancy-trend', (req, res) => {
  const stmt = db.prepare('SELECT total, occupied, cars, bikes FROM occupancy_snapshots WHERE ts >= ? AND ts < ?');
  const data = twoHourBuckets().map((b) => {
    const rows = stmt.all(b.from, b.to);
    if (rows.length === 0) return { time: b.label, occupancyPercent: 0, cars: 0, bikes: 0 };
    const avg = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
    const total = avg('total') || 1;
    return {
      time: b.label,
      occupancyPercent: Math.round((avg('occupied') / total) * 100),
      cars: Math.round(avg('cars')),
      bikes: Math.round(avg('bikes')),
    };
  });
  res.json(data);
});

router.get('/entries-by-type', (req, res) => {
  const stmt = db.prepare(`
    SELECT coalesce(sum(vehicle_type = 'car'), 0) as cars, coalesce(sum(vehicle_type = 'bike'), 0) as bikes
    FROM sessions WHERE entry_time >= ? AND entry_time < ?
  `);
  res.json(twoHourBuckets().map((b) => ({ hour: b.label, ...stmt.get(b.from, b.to) })));
});

router.get('/zone-utilization', (req, res) => {
  const zones = db.prepare(`
    SELECT zone, count(*) as total, coalesce(sum(status = 'occupied'), 0) as occupied
    FROM slots GROUP BY zone ORDER BY zone
  `).all();
  res.json(zones.map((z) => ({
    zone: z.zone,
    total: z.total,
    occupied: z.occupied,
    utilizationPercent: z.total > 0 ? Math.round((z.occupied / z.total) * 100) : 0,
  })));
});

router.get('/capacity-comparison', (req, res) => {
  const fixed = { cars: 60, bikes: 0 };
  const row = (scenario, mode) => {
    const p = planSummary(mode, fixed);
    return { scenario, totalSlots: p.total, carBays: p.cars, bikeBays: p.bikes, capacityGain: p.capacityGainPercent };
  };
  res.json([
    { scenario: 'Fixed Thermoplastic Paint', totalSlots: FIXED_BASELINE_CAPACITY, carBays: FIXED_BASELINE_CAPACITY, bikeBays: 0, capacityGain: 0 },
    row('Maargdarshak Adaptive (Car Peak)', 'car-peak'),
    row('Maargdarshak Adaptive (Balanced)', 'balanced'),
    row('Maargdarshak Adaptive (2W Peak)', '2w-peak'),
  ]);
});

router.get('/recent-events', (req, res) => {
  res.json(db.prepare('SELECT * FROM event_logs ORDER BY id DESC LIMIT 15').all());
});

export default router;
