import { db, NOW } from './db.js';
import { broadcast } from './ws.js';
import { adaptiveSlotSpecs, planSummary, MODES } from './layoutPlans.js';
import { resolveGuidance } from './guidance.js';
import { computeFee } from './parking.js';

export function getLayoutState() {
  const state = db.prepare('SELECT * FROM layout_state WHERE id = 1').get();
  const rules = db.prepare('SELECT * FROM guidance_rules').all();
  const history = db.prepare('SELECT * FROM layout_history ORDER BY id DESC LIMIT 10').all();
  const schedule = db.prepare('SELECT * FROM layout_schedule WHERE enabled = 1').all();

  // Live demand ratio computed from vehicles that are parked right now.
  const rows = db.prepare("SELECT vehicle_type, count(*) as count FROM sessions WHERE status = 'active' GROUP BY vehicle_type").all();
  const cars = rows.find((r) => r.vehicle_type === 'car')?.count || 0;
  const bikes = rows.find((r) => r.vehicle_type === 'bike')?.count || 0;
  const demandRatioBike = cars + bikes > 0 ? Math.round((bikes / (cars + bikes)) * 100) : state.demand_ratio_bike;

  return { ...state, live_demand_ratio_bike: demandRatioBike, live_demand_ratio_car: 100 - demandRatioBike, rules, history, schedule };
}

function fixedCounts() {
  const rows = db.prepare('SELECT type, count(*) as n FROM slots WHERE is_adaptive = 0 GROUP BY type').all();
  return { cars: rows.find((r) => r.type === 'car')?.n || 0, bikes: rows.find((r) => r.type === 'bike')?.n || 0 };
}

export function previewLayout(targetMode) {
  const currentSlots = db.prepare('SELECT count(*) as total, type FROM slots GROUP BY type').all();
  const currentTotal = db.prepare('SELECT count(*) as total FROM slots').get().total;
  const p = planSummary(MODES.includes(targetMode) ? targetMode : 'balanced', fixedCounts());

  return {
    targetMode,
    current: { total: currentTotal, slots: currentSlots },
    predicted: { total: p.total, cars: p.cars, bikes: p.bikes, capacityGainPercent: p.capacityGainPercent },
  };
}

export function applyLayout(targetMode, reason = 'Operator manual trigger') {
  if (!MODES.includes(targetMode)) {
    throw Object.assign(new Error(`Unknown layout mode '${targetMode}'. Use one of: ${MODES.join(', ')}.`), { status: 400 });
  }

  const currentState = db.prepare('SELECT * FROM layout_state WHERE id = 1').get();
  const preview = previewLayout(targetMode);

  broadcast('layout.changing', { fromMode: currentState.current_mode, toMode: targetMode, durationSeconds: 3, reason });

  let displaced = 0;

  db.transaction(() => {
    // 1. Remember vehicles that are parked in the adaptive zone, then clear it.
    const parked = db.prepare(`
      SELECT s.id as session_id, s.vehicle_number, s.vehicle_type, s.entry_time
      FROM sessions s JOIN slots sl ON sl.id = s.slot_id
      WHERE s.status = 'active' AND sl.is_adaptive = 1 ORDER BY s.entry_time ASC
    `).all();

    db.prepare('SELECT id FROM slots WHERE is_adaptive = 1').all().forEach((s) => resolveGuidance(s.id, 'cancelled'));
    db.prepare('DELETE FROM slots WHERE is_adaptive = 1').run();

    // 2. Build the new bays.
    const insertSlot = db.prepare(`
      INSERT INTO slots (id, zone, type, status, is_ev, is_accessible, is_adaptive, sensor_id, x, y, w, h)
      VALUES (?, 'Zone B', ?, 'available', ?, 0, 1, ?, ?, ?, ?, ?)
    `);
    adaptiveSlotSpecs(targetMode).forEach((s) => insertSlot.run(s.id, s.type, s.is_ev, `US-${s.id}`, s.x, s.y, s.w, s.h));

    // 3. Move parked vehicles into matching new bays; close sessions of those that no longer fit.
    parked.forEach((v) => {
      const target = db.prepare("SELECT id FROM slots WHERE is_adaptive = 1 AND type = ? AND status = 'available' ORDER BY id LIMIT 1").get(v.vehicle_type);
      if (target) {
        db.prepare("UPDATE slots SET status = 'occupied', current_vehicle = ?, occupied_since = ? WHERE id = ?").run(v.vehicle_number, v.entry_time, target.id);
        db.prepare('UPDATE sessions SET slot_id = ? WHERE id = ?').run(target.id, v.session_id);
      } else {
        const minutes = Math.max(1, Math.round((Date.now() - new Date(v.entry_time).getTime()) / 60000));
        db.prepare("UPDATE sessions SET status = 'completed', exit_time = ?, duration_minutes = ?, fee = ? WHERE id = ?")
          .run(new Date().toISOString(), minutes, computeFee(minutes, v.vehicle_type), v.session_id);
        db.prepare('INSERT INTO event_logs (event_type, message) VALUES (?, ?)')
          .run('layout', `Vehicle ${v.vehicle_number} relocated out of Zone B (no ${v.vehicle_type} bay in ${targetMode})`);
        displaced++;
      }
    });

    db.prepare('INSERT INTO layout_history (from_mode, to_mode, reason, capacity_before, capacity_after, timestamp) VALUES (?, ?, ?, ?, ?, ?)')
      .run(currentState.current_mode, targetMode, reason, preview.current.total, preview.predicted.total, new Date().toISOString());

    db.prepare(`
      UPDATE layout_state
      SET current_mode = ?, capacity_gain_percent = ?, transitioning = 0, transition_progress = 100, last_changed = ${NOW}
      WHERE id = 1
    `).run(targetMode, preview.predicted.capacityGainPercent);

    db.prepare('INSERT INTO event_logs (event_type, message) VALUES (?, ?)')
      .run('layout', `Layout changed ${currentState.current_mode} → ${targetMode}: ${preview.predicted.total} bays (+${preview.predicted.capacityGainPercent}%). ${reason}`);
  })();

  broadcast('layout.changed', {
    newMode: targetMode,
    capacityGainPercent: preview.predicted.capacityGainPercent,
    totalSlots: preview.predicted.total,
    timestamp: new Date().toISOString(),
  });
  broadcast('lot.state', { slots: db.prepare('SELECT * FROM slots').all() });

  return { success: true, newMode: targetMode, capacityGainPercent: preview.predicted.capacityGainPercent, totalSlots: preview.predicted.total, displacedVehicles: displaced };
}
