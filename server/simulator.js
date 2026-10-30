// Demo traffic generator. When no real hardware is connected it creates vehicles that go
// through the SAME guidance -> park -> leave flow as real traffic would.
import { db, getSetting } from './db.js';
import { broadcast } from './ws.js';
import { requestGuidance } from './guidance.js';
import { parkVehicle, freeSlot } from './parking.js';

let timer = null;

const STATES = ['KA', 'MH', 'DL', 'TN', 'HR', 'TS', 'CG', 'MP'];
const rnd = (n) => Math.floor(Math.random() * n);
const letter = () => String.fromCharCode(65 + rnd(26));
const randomPlate = () => `${STATES[rnd(STATES.length)]}-${10 + rnd(89)}-${letter()}${letter()}-${1000 + rnd(8999)}`;

const intervalMs = () => Math.max(1, parseInt(getSetting('simulator_interval_sec', '4'), 10) || 4) * 1000;
const enabled = () => getSetting('simulator_enabled', 'true') === 'true';

export function startSimulator() {
  if (timer) return;
  const tick = () => {
    timer = setTimeout(tick, intervalMs());
    if (!enabled()) return;
    try {
      const roll = Math.random();
      if (roll < 0.45) simulateVehicleEntry();
      else if (roll < 0.8) simulateVehicleExit();
      else simulateSensorHeartbeat();
    } catch (err) {
      console.error('Simulator step error:', err.message);
    }
  };
  timer = setTimeout(tick, intervalMs());
  console.log('✅ Maargdarshak traffic simulator running (toggle it in Settings → Simulator).');
}

export function stopSimulator() {
  if (timer) clearTimeout(timer);
  timer = null;
}

function simulateVehicleEntry() {
  const layout = db.prepare('SELECT demand_ratio_bike FROM layout_state WHERE id = 1').get();
  const vehicleType = Math.random() * 100 < (layout?.demand_ratio_bike || 60) ? 'bike' : 'car';
  const vehicleNumber = randomPlate();

  const result = requestGuidance({ vehicleType, vehicleNumber });
  if (!result.ok) return;
  const { slotId, distanceMeters } = result.guidance;

  // The driver follows the laser; the slot sensor then reports the car after a travel time.
  const travelMs = Math.min(15000, 3000 + distanceMeters * 120);
  setTimeout(() => {
    try {
      const slot = db.prepare('SELECT status FROM slots WHERE id = ?').get(slotId);
      if (slot?.status === 'available') parkVehicle({ slotId, vehicleNumber, vehicleType, source: 'simulator' });
    } catch (err) {
      console.error('Simulator arrival error:', err.message);
    }
  }, travelMs).unref();
}

function simulateVehicleExit() {
  // Only cars that have been parked for at least a minute may leave.
  const cutoff = new Date(Date.now() - 60000).toISOString();
  const slot = db.prepare("SELECT id FROM slots WHERE status = 'occupied' AND occupied_since < ? ORDER BY RANDOM() LIMIT 1").get(cutoff);
  if (slot) freeSlot({ slotId: slot.id, source: 'simulator' });
}

function simulateSensorHeartbeat() {
  const device = db.prepare("SELECT id, type, status FROM devices WHERE status = 'online' ORDER BY RANDOM() LIMIT 1").get();
  if (!device) return;
  db.prepare('UPDATE devices SET last_seen = ?, battery = MAX(40, battery - 1) WHERE id = ?').run(new Date().toISOString(), device.id);
  broadcast('device.status', db.prepare('SELECT * FROM devices WHERE id = ?').get(device.id));
}
