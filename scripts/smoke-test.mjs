// End-to-end smoke test: node scripts/smoke-test.mjs  (server must be running; BASE=http://localhost:3001)
import { WebSocket } from 'ws';

const BASE = process.env.BASE || 'http://localhost:3001';
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};
const call = async (method, path, body, headers = {}) => {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
};

console.log('Health & auth');
let r = await call('GET', '/api/health');
check('health ok', r.status === 200 && r.json.status === 'healthy');
r = await call('POST', '/api/auth/login', { email: 'admin@maargdarshak.in', password: 'wrong' });
check('bad password rejected', r.status === 401);
r = await call('POST', '/api/auth/login', { email: 'operator@maargdarshak.in', password: 'operator123' });
check('operator login', r.status === 200 && !!r.json.token);
const op = { Authorization: `Bearer ${r.json.token}` };
r = await call('POST', '/api/auth/login', { email: 'viewer@maargdarshak.in', password: 'viewer123' });
const viewer = { Authorization: `Bearer ${r.json.token}` };
r = await call('POST', '/api/auth/login', { email: 'admin@maargdarshak.in', password: 'admin123' });
const admin = { Authorization: `Bearer ${r.json.token}` };

// Keep the demo traffic simulator from changing slots underneath the test.
await call('POST', '/api/settings', { simulator_enabled: 'false' }, admin);
await new Promise((res) => setTimeout(res, 5000)); // let any in-flight simulated arrival finish

console.log('Lot state');
r = await call('GET', '/api/lot/state');
check('lot state has slots', r.json.slots?.length > 50, JSON.stringify(r.json.summary));
check('summary adds up', r.json.summary.occupied + r.json.summary.available + r.json.summary.blocked === r.json.summary.total);

console.log('Role protection');
r = await call('PATCH', '/api/slots/C02', { action: 'block' }, viewer);
check('viewer cannot modify slots', r.status === 403);
r = await call('PATCH', '/api/slots/C02', { action: 'block' });
check('anonymous cannot modify slots', r.status === 401);

console.log('Laser guidance flow');
const events = [];
const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws');
await new Promise((res) => ws.on('open', res));
ws.on('message', (m) => events.push(JSON.parse(m).event));

r = await call('POST', '/api/guidance/request', { vehicleType: 'car', vehicleNumber: 'TEST-01-AA-0001' });
check('guidance assigned', r.status === 201 && r.json.guidance?.slotId, JSON.stringify(r.json));
const g = r.json.guidance;
check('path has waypoints', g?.path?.length === 3);
check('non-EV car is NOT sent to an EV bay', g && g.slot.is_ev === 0);
r = await call('GET', '/api/guidance/active');
check('active list contains ticket', r.json.active.some((a) => a.ticket === g.ticket));
r = await call('GET', '/api/lasers');
const laser = r.json.find((l) => l.target_slot === g.slotId);
check('laser unit pointed at slot', g.laserId ? !!laser : true, g.laserId);

r = await call('POST', '/api/guidance/request', { vehicleType: 'car', needsEv: true });
check('EV request goes to an EV bay', r.status === 201 && r.json.guidance.slot.is_ev === 1);
const evTicket = r.json.guidance.ticket;
r = await call('DELETE', `/api/guidance/${evTicket}`);
check('ticket can be cancelled', r.status === 200);

console.log('Hardware sensor path');
r = await call('POST', '/api/sensors/reading', { sensorId: `US-${g.slotId}`, occupied: true }, { 'X-API-Key': 'wrong' });
check('bad API key rejected', r.status === 401);
r = await call('GET', '/api/settings', null, admin);
const apiKey = r.json.api_key;
r = await call('POST', '/api/sensors/reading', { sensorId: `US-${g.slotId}`, occupied: true, distanceCm: 40, battery: 88 }, { 'X-API-Key': apiKey });
check('sensor marks slot occupied', r.status === 200 && r.json.status === 'occupied' && r.json.changed === true, JSON.stringify(r.json));
r = await call('GET', '/api/slots?search=' + g.slotId);
const s1 = r.json.find((s) => s.id === g.slotId);
check('plate from guidance ticket attached', s1.current_vehicle === 'TEST-01-AA-0001', s1.current_vehicle);
r = await call('GET', '/api/guidance/active');
check('guidance auto-resolved on arrival', !r.json.active.some((a) => a.ticket === g.ticket));
r = await call('GET', '/api/lasers');
check('laser released', !r.json.some((l) => l.target_slot === g.slotId));
r = await call('POST', '/api/sensors/reading', { sensorId: `US-${g.slotId}`, occupied: false }, { 'X-API-Key': apiKey });
check('sensor frees slot', r.status === 200 && r.json.status === 'available');
r = await call('GET', '/api/sessions?search=TEST-01-AA-0001', null, op);
check('session recorded & completed', r.json.sessions?.[0]?.status === 'completed', JSON.stringify(r.json.sessions?.[0]));
r = await call('POST', '/api/sensors/reading', { sensorId: 'US-NOPE', occupied: true }, { 'X-API-Key': apiKey });
check('unknown sensor -> 404', r.status === 404);
r = await call('GET', '/api/lasers/LZ-01/command', null, { 'X-API-Key': apiKey });
check('laser command endpoint', r.status === 200 && 'intensity' in r.json);

console.log('Operator actions');
r = await call('POST', '/api/vehicles/entry', { vehicleNumber: 'mh12zz9999', vehicleType: 'bike' }, op);
check('manual entry', r.status === 200 && r.json.vehicleNumber === 'MH12ZZ9999', JSON.stringify(r.json));
const manualSlot = r.json.slotId;
r = await call('POST', '/api/vehicles/exit', { slotId: manualSlot }, op);
check('manual exit with fee', r.status === 200 && typeof r.json.fee === 'number');
r = await call('PATCH', '/api/slots/C02', { action: 'block' }, op);
check('block slot', r.status === 200 && r.json.slot.status === 'blocked');
r = await call('PATCH', '/api/slots/C02', { action: 'unblock' }, op);
check('unblock slot', r.status === 200 && r.json.slot.status === 'available');
r = await call('GET', '/api/sessions?exportCsv=true', null, op);
check('CSV export', typeof r.json === 'string' && r.json.startsWith('ID,Vehicle'));

console.log('Adaptive layout');
r = await call('POST', '/api/layout/preview', { mode: '2w-peak' });
const prev = r.json.predicted;
r = await call('POST', '/api/layout/apply', { mode: '2w-peak', reason: 'smoke test' }, op);
check('layout applied', r.status === 200 && r.json.newMode === '2w-peak');
r = await call('GET', '/api/lot/state');
check('preview total equals real slot count', r.json.summary.total === prev.total, `${r.json.summary.total} vs ${prev.total}`);
r = await call('POST', '/api/layout/apply', { mode: 'nonsense' }, op);
check('invalid layout mode rejected', r.status === 400);
await call('POST', '/api/layout/apply', { mode: 'balanced', reason: 'smoke test restore' }, op);

console.log('Analytics, alerts, devices');
r = await call('GET', '/api/analytics/kpis');
check('kpis', r.status === 200 && r.json.total > 0 && r.json.vehiclesEnteredToday >= 0, JSON.stringify(r.json));
r = await call('GET', '/api/analytics/occupancy-trend');
check('occupancy trend has 12 points', r.json.length === 12);
r = await call('GET', '/api/analytics/entries-by-type');
check('entries by type', r.json.length === 12);
r = await call('GET', '/api/alerts');
check('alerts', Array.isArray(r.json.alerts));
r = await call('GET', '/api/devices');
check('devices include one sensor per slot', r.json.filter((d) => d.type === 'ultrasonic').length > 100);
r = await call('GET', '/api/guidance/stats');
check('guidance stats', r.json.total >= 2);

await new Promise((res) => setTimeout(res, 300));
ws.close();
check('websocket got guidance.assigned', events.includes('guidance.assigned'), events.join(','));
check('websocket got slot.updated', events.includes('slot.updated'));
check('websocket got laser.updated', events.includes('laser.updated'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
