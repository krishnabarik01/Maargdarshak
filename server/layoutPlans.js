// Pure data: what Zone B looks like in each adaptive layout mode.
// Used for seeding, previews and actually applying a layout so the numbers always agree.

export const FIXED_BASELINE_CAPACITY = 60; // a conventional fixed-paint lot with only car bays
export const MODES = ['2w-peak', 'car-peak', 'balanced'];

const pad = (i) => String(i).padStart(2, '0');

/** Zone B slot specs for a mode: [{ id, type, is_ev, x, y, w, h }] */
export function adaptiveSlotSpecs(mode) {
  const specs = [];
  if (mode === '2w-peak') {
    for (let i = 1; i <= 60; i++) {
      specs.push({ id: `B${pad(i)}`, type: 'bike', is_ev: i <= 8 ? 1 : 0, x: 50 + ((i - 1) % 20) * 32, y: 240 + Math.floor((i - 1) / 20) * 60, w: 26, h: 45 });
    }
  } else if (mode === 'car-peak') {
    for (let i = 1; i <= 24; i++) {
      specs.push({ id: `B${pad(i)}`, type: 'car', is_ev: i <= 4 ? 1 : 0, x: 55 + ((i - 1) % 12) * 52, y: 240 + Math.floor((i - 1) / 12) * 85, w: 44, h: 70 });
    }
  } else {
    // balanced: 12 car bays + 30 bike bays
    for (let i = 1; i <= 12; i++) {
      specs.push({ id: `BC${pad(i)}`, type: 'car', is_ev: 0, x: 55 + (i - 1) * 52, y: 240, w: 44, h: 65 });
    }
    for (let i = 1; i <= 30; i++) {
      specs.push({ id: `B${pad(i)}`, type: 'bike', is_ev: i <= 4 ? 1 : 0, x: 50 + ((i - 1) % 15) * 42, y: 320 + Math.floor((i - 1) / 15) * 55, w: 28, h: 45 });
    }
  }
  return specs;
}

export function planSummary(mode, fixedSlotCounts = { cars: 60, bikes: 0 }) {
  const specs = adaptiveSlotSpecs(mode);
  const cars = fixedSlotCounts.cars + specs.filter((s) => s.type === 'car').length;
  const bikes = fixedSlotCounts.bikes + specs.filter((s) => s.type === 'bike').length;
  const total = cars + bikes;
  return {
    total,
    cars,
    bikes,
    capacityGainPercent: Math.round(((total - FIXED_BASELINE_CAPACITY) / FIXED_BASELINE_CAPACITY) * 100),
  };
}
