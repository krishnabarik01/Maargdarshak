// Guidance engine: picks the best vacant slot for an arriving vehicle,
// holds it for a short time and points a laser unit at it.
import crypto from 'crypto';
import { db, getSetting, NOW } from './db.js';
import { broadcast } from './ws.js';

export const PX_PER_METER = 24;
// Entry gate position and the main drive lane (canvas pixels, same space as slots.x / slots.y).
export const GATE = { x: 20, y: 20 };
const LANE_X = 20;

// slotId -> reservation
const reservations = new Map();

const center = (s) => ({ cx: s.x + s.w / 2, cy: s.y + s.h / 2 });

/** Path: gate -> down the entry lane -> along the aisle of the chosen slot. */
export function buildPath(slot) {
  const { cx, cy } = center(slot);
  return [
    { x: GATE.x, y: GATE.y },
    { x: LANE_X, y: cy },
    { x: cx, y: cy },
  ];
}

export function pathDistanceMeters(slot) {
  const { cx, cy } = center(slot);
  return Math.round(((Math.abs(cy - GATE.y) + Math.abs(cx - LANE_X)) / PX_PER_METER) * 10) / 10;
}

function ruleEnabled(key) {
  return db.prepare('SELECT enabled FROM guidance_rules WHERE rule_key = ?').get(key)?.enabled === 1;
}

function pickLaser(slot) {
  return db.prepare(`
    SELECT * FROM lasers
    WHERE zone = ? AND status IN ('online','standby') AND mode = 'guidance' AND target_slot IS NULL
    ORDER BY id ASC LIMIT 1
  `).get(slot.zone);
}

export function isReserved(slotId) {
  return reservations.has(slotId);
}

export function listActiveGuidance() {
  return [...reservations.values()].map(publicView);
}

function publicView(r) {
  return {
    ticket: r.ticket,
    slotId: r.slotId,
    zone: r.zone,
    laserId: r.laserId,
    vehicleType: r.vehicleType,
    vehicleNumber: r.vehicleNumber,
    distanceMeters: r.distanceMeters,
    path: r.path,
    requestedAt: r.requestedAt,
    expiresAt: r.expiresAt,
  };
}

export function getReservation(slotId) {
  return reservations.get(slotId) || null;
}

/**
 * Find and reserve the best slot.
 * Returns { ok: true, guidance } or { ok: false, error, code }.
 */
export function requestGuidance({ vehicleType = 'car', vehicleNumber = null, needsEv = false, needsAccessible = false } = {}) {
  if (!['car', 'bike'].includes(vehicleType)) {
    return { ok: false, code: 400, error: "vehicleType must be 'car' or 'bike'." };
  }

  const evRule = ruleEnabled('ev_priority');
  const accRule = ruleEnabled('accessible');

  const candidates = db.prepare("SELECT * FROM slots WHERE type = ? AND status = 'available'").all(vehicleType)
    .filter((s) => !reservations.has(s.id))
    .filter((s) => (needsEv ? s.is_ev === 1 : true))
    .filter((s) => (needsAccessible ? s.is_accessible === 1 : true));

  if (candidates.length === 0) {
    const what = needsEv ? 'EV charging ' : needsAccessible ? 'accessible ' : '';
    return { ok: false, code: 409, error: `No vacant ${what}${vehicleType} slots right now.` };
  }

  // Lowest score wins: shortest path, but keep EV / accessible bays free for those who need them.
  const scored = candidates.map((s) => {
    let score = pathDistanceMeters(s);
    if (!needsEv && s.is_ev && evRule) score += 500;
    if (!needsAccessible && s.is_accessible && accRule) score += 500;
    return { slot: s, score };
  }).sort((a, b) => a.score - b.score || a.slot.id.localeCompare(b.slot.id));

  const slot = scored[0].slot;
  const laser = pickLaser(slot);
  const holdSeconds = parseInt(getSetting('guidance_hold_seconds', '120'), 10) || 120;
  const now = Date.now();

  const reservation = {
    ticket: crypto.randomBytes(4).toString('hex').toUpperCase(),
    slotId: slot.id,
    zone: slot.zone,
    laserId: laser?.id || null,
    vehicleType,
    vehicleNumber: vehicleNumber ? String(vehicleNumber).toUpperCase().trim().slice(0, 20) : null,
    distanceMeters: pathDistanceMeters(slot),
    path: buildPath(slot),
    requestedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + holdSeconds * 1000).toISOString(),
    expiresMs: now + holdSeconds * 1000,
  };

  db.transaction(() => {
    if (laser) {
      db.prepare(`UPDATE lasers SET status = 'active', target_slot = ?, last_ping = ${NOW} WHERE id = ?`).run(slot.id, laser.id);
    }
    db.prepare(`
      INSERT INTO guidance_log (ticket, slot_id, laser_id, vehicle_type, vehicle_number, distance_m, requested_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(reservation.ticket, slot.id, laser?.id || null, vehicleType, reservation.vehicleNumber, reservation.distanceMeters, reservation.requestedAt);
    db.prepare('INSERT INTO event_logs (event_type, message) VALUES (?, ?)')
      .run('guidance', `Guidance ${reservation.ticket}: ${vehicleType.toUpperCase()} directed to ${slot.id}${laser ? ` via ${laser.id}` : ' (display only)'} — ${reservation.distanceMeters} m`);
  })();

  reservations.set(slot.id, reservation);

  if (laser) broadcast('laser.updated', db.prepare('SELECT * FROM lasers WHERE id = ?').get(laser.id));
  broadcast('guidance.assigned', publicView(reservation));

  return { ok: true, guidance: { ...publicView(reservation), slot } };
}

/** Close the reservation for a slot (vehicle arrived, expired, cancelled) and free its laser. */
export function resolveGuidance(slotId, outcome = 'arrived') {
  const r = reservations.get(slotId);
  if (!r) return null;
  reservations.delete(slotId);

  db.transaction(() => {
    db.prepare(`
      UPDATE guidance_log SET outcome = ?, resolved_at = ?
      WHERE ticket = ? AND outcome = 'pending'
    `).run(outcome, new Date().toISOString(), r.ticket);
    if (r.laserId) {
      db.prepare(`UPDATE lasers SET status = 'online', target_slot = NULL, last_ping = ${NOW} WHERE id = ? AND status = 'active'`).run(r.laserId);
    }
  })();

  if (r.laserId) broadcast('laser.updated', db.prepare('SELECT * FROM lasers WHERE id = ?').get(r.laserId));
  broadcast('guidance.resolved', { ticket: r.ticket, slotId, outcome });
  return r;
}

export function cancelGuidanceByTicket(ticket) {
  for (const r of reservations.values()) {
    if (r.ticket === String(ticket).toUpperCase()) return resolveGuidance(r.slotId, 'cancelled');
  }
  return null;
}

export function sweepExpiredGuidance() {
  const now = Date.now();
  for (const r of [...reservations.values()]) {
    if (r.expiresMs <= now) resolveGuidance(r.slotId, 'expired');
  }
}

/** On boot the in-memory reservations are gone, so clean up anything left over from a previous run. */
export function initGuidance() {
  db.prepare("UPDATE lasers SET status = 'online', target_slot = NULL WHERE status = 'active'").run();
  db.prepare("UPDATE guidance_log SET outcome = 'expired', resolved_at = ? WHERE outcome = 'pending'").run(new Date().toISOString());
  setInterval(sweepExpiredGuidance, 5000).unref();
}
