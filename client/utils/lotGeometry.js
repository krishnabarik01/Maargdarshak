/**
 * lotGeometry.js
 * Geometrically accurate, real-world meter scale system for Maargdarshak.
 * 
 * CORE AXIOM:
 * 1 Car Bay (2.5m × 5.0m = 12.5m²) === 4 Two-Wheeler Bays (2 cols × 2 rows of 1.25m × 2.5m = 12.5m²).
 */

export const PX_PER_METER = 24;

export const DIMENSIONS = {
  // Bays (meters)
  CAR_BAY: { width: 2.5, length: 5.0, area: 12.5 },
  BIKE_BAY: { width: 1.25, length: 2.5, area: 3.125 },
  ACCESSIBLE_BAY: { width: 3.6, length: 5.0, area: 18.0 },
  DRIVING_LANE: { width: 5.5 },

  // Vehicles (meters)
  CAR_VEHICLE: {
    width: 1.8,
    length: 4.3,
    area: 1.8 * 4.3, // 7.74 m²
    wheelbase: 2.6,
    frontOverhang: 0.85,
    rearOverhang: 0.85,
    wheelWidth: 0.22,
    wheelLength: 0.65,
  },
  BIKE_VEHICLE: {
    width: 0.8,
    length: 2.0,
    area: 0.8 * 2.0, // 1.60 m²
    wheelWidth: 0.12,
    wheelLength: 0.60,
  },

  // Lot layout in meters
  LOT: {
    // 10 modular macro-bays + 1 accessible bay in each row
    MODULAR_BAYS_PER_ROW: 10,
    TOTAL_ROWS: 2, // North and South
    MARGIN_LEFT: 3.0, // Entrance area
    MARGIN_RIGHT: 3.0, // Exit area
    MARGIN_TOP: 1.2,
    MARGIN_BOTTOM: 1.2,
    DRIVEWAY_WIDTH: 5.5,
  }
};

/**
 * Convert meters to pixels
 */
export function mToPx(m) {
  return m * PX_PER_METER;
}

/**
 * Convert pixels to meters
 */
export function pxToM(px) {
  return px / PX_PER_METER;
}

/**
 * Validate that a vehicle fits inside a bay with margins
 */
export function vehicleFitsInBay(vehicleType, bayType) {
  if (bayType === 'accessible') return vehicleType === 'car';
  if (bayType === 'car' || bayType === 'ev') return vehicleType === 'car';
  if (bayType === 'bike') return vehicleType === 'bike';
  return false;
}

/**
 * Assertion check: Vehicle dimensions must strictly be smaller than bay dimensions
 */
export function assertVehicleFits(vehicleType, bayType) {
  const v = vehicleType === 'car' ? DIMENSIONS.CAR_VEHICLE : DIMENSIONS.BIKE_VEHICLE;
  const b = bayType === 'accessible'
    ? DIMENSIONS.ACCESSIBLE_BAY
    : bayType === 'bike'
    ? DIMENSIONS.BIKE_BAY
    : DIMENSIONS.CAR_BAY;

  const widthMargin = (b.width - v.width) / 2;
  const lengthMargin = (b.length - v.length) / 2;

  if (widthMargin < 0 || lengthMargin < 0) {
    throw new Error(`Vehicle ${vehicleType} (${v.width}x${v.length}m) exceeds bay ${bayType} (${b.width}x${b.length}m)!`);
  }

  return { widthMargin, lengthMargin };
}

/**
 * Compute total parkable area for the lot (constant invariant)
 * 20 modular bays of 12.5 m² + 2 accessible bays of 18.0 m² = 286.0 m²
 */
export function getLotParkableArea() {
  const modularArea = DIMENSIONS.LOT.MODULAR_BAYS_PER_ROW * DIMENSIONS.LOT.TOTAL_ROWS * DIMENSIONS.CAR_BAY.area;
  const accessibleArea = 2 * DIMENSIONS.ACCESSIBLE_BAY.area;
  return modularArea + accessibleArea; // 250 + 36 = 286 m²
}

/**
 * Generate modular slot layout based on mode and demand ratio
 * Follows exact 1 Car Bay -> 4 Bike Bays division rule.
 */
export function generateMeterLayout(mode, demandRatio = 50) {
  // Determine how many modular macro-bays become Bike zones (each gives 4 bike bays)
  // Total modular macro bays = 20 (10 North, 10 South)
  const totalModularBays = DIMENSIONS.LOT.MODULAR_BAYS_PER_ROW * DIMENSIONS.LOT.TOTAL_ROWS; // 20
  let bikeModularCount = 0;

  if (mode === 'car-peak') {
    bikeModularCount = 2; // 2 macro bays = 8 bike bays, 18 car bays
  } else if (mode === '2w-peak') {
    bikeModularCount = 18; // 18 macro bays = 72 bike bays, 2 car bays
  } else if (mode === 'balanced') {
    bikeModularCount = 10; // 10 macro bays = 40 bike bays, 10 car bays
  } else if (mode === 'auto') {
    // Demand ratio: 0 (100% car) to 100 (100% 2W)
    const ratio = Math.max(0, Math.min(100, demandRatio)) / 100;
    bikeModularCount = Math.round(ratio * (totalModularBays - 2)); // keep at least 2 for cars
  }

  const northBikeModular = Math.ceil(bikeModularCount / 2);
  const southBikeModular = Math.floor(bikeModularCount / 2);

  const slots = [];
  const startX_m = DIMENSIONS.LOT.MARGIN_LEFT; // e.g. 3.0m

  // NORTH ROW (Facing south towards driving lane, closed at top y=1.2m, open at y=6.2m)
  const northY_m = DIMENSIONS.LOT.MARGIN_TOP; // 1.2m
  let currentX_m = startX_m;

  // 1. North Accessible Bay (entrance-adjacent)
  slots.push({
    id: 'ACC-N1',
    macroIndex: -1,
    subIndex: 0,
    sector: 'North',
    type: 'accessible',
    x_m: currentX_m,
    y_m: northY_m,
    width_m: DIMENSIONS.ACCESSIBLE_BAY.width,
    length_m: DIMENSIONS.ACCESSIBLE_BAY.length,
    area_m2: DIMENSIONS.ACCESSIBLE_BAY.area,
    facing: 'south', // open to south driving lane
    isEv: false,
    isAccessible: true,
  });
  currentX_m += DIMENSIONS.ACCESSIBLE_BAY.width;

  // 2. North Modular Bays (10 macro bays)
  for (let m = 0; m < DIMENSIONS.LOT.MODULAR_BAYS_PER_ROW; m++) {
    const isBikeZone = m < northBikeModular;
    const macroX_m = currentX_m;

    if (!isBikeZone) {
      // 1 CAR BAY
      slots.push({
        id: `N-${(m + 1).toString().padStart(2, '0')}`,
        macroIndex: m,
        subIndex: 0,
        sector: 'North',
        type: m === 4 || m === 8 ? 'ev' : 'car',
        x_m: macroX_m,
        y_m: northY_m,
        width_m: DIMENSIONS.CAR_BAY.width,
        length_m: DIMENSIONS.CAR_BAY.length,
        area_m2: DIMENSIONS.CAR_BAY.area,
        facing: 'south',
        isEv: m === 4 || m === 8,
        isAccessible: false,
      });
    } else {
      // SPLIT INTO 4 BIKE BAYS (2 cols × 2 rows of 1.25 × 2.5m)
      // Row 1 (upper, closed end)
      // Row 2 (lower, lane end)
      for (let col = 0; col < 2; col++) {
        for (let row = 0; row < 2; row++) {
          const subIdx = col * 2 + row;
          slots.push({
            id: `N-B${(m + 1)}.${subIdx + 1}`,
            macroIndex: m,
            subIndex: subIdx,
            sector: 'North',
            type: 'bike',
            x_m: macroX_m + col * DIMENSIONS.BIKE_BAY.width,
            y_m: northY_m + row * DIMENSIONS.BIKE_BAY.length,
            width_m: DIMENSIONS.BIKE_BAY.width,
            length_m: DIMENSIONS.BIKE_BAY.length,
            area_m2: DIMENSIONS.BIKE_BAY.area,
            facing: 'south',
            isEv: false,
            isAccessible: false,
          });
        }
      }
    }
    currentX_m += DIMENSIONS.CAR_BAY.width;
  }

  // SOUTH ROW (Facing north towards driving lane, open at y=11.7m, closed at y=16.7m)
  const southY_m = northY_m + DIMENSIONS.CAR_BAY.length + DIMENSIONS.LOT.DRIVEWAY_WIDTH; // 1.2 + 5.0 + 5.5 = 11.7m
  currentX_m = startX_m;

  // 1. South Accessible Bay
  slots.push({
    id: 'ACC-S1',
    macroIndex: -2,
    subIndex: 0,
    sector: 'South',
    type: 'accessible',
    x_m: currentX_m,
    y_m: southY_m,
    width_m: DIMENSIONS.ACCESSIBLE_BAY.width,
    length_m: DIMENSIONS.ACCESSIBLE_BAY.length,
    area_m2: DIMENSIONS.ACCESSIBLE_BAY.area,
    facing: 'north',
    isEv: false,
    isAccessible: true,
  });
  currentX_m += DIMENSIONS.ACCESSIBLE_BAY.width;

  // 2. South Modular Bays (10 macro bays)
  for (let m = 0; m < DIMENSIONS.LOT.MODULAR_BAYS_PER_ROW; m++) {
    const isBikeZone = m < southBikeModular;
    const macroX_m = currentX_m;

    if (!isBikeZone) {
      // 1 CAR BAY
      slots.push({
        id: `S-${(m + 1).toString().padStart(2, '0')}`,
        macroIndex: m + 10,
        subIndex: 0,
        sector: 'South',
        type: m === 3 ? 'ev' : 'car',
        x_m: macroX_m,
        y_m: southY_m,
        width_m: DIMENSIONS.CAR_BAY.width,
        length_m: DIMENSIONS.CAR_BAY.length,
        area_m2: DIMENSIONS.CAR_BAY.area,
        facing: 'north',
        isEv: m === 3,
        isAccessible: false,
      });
    } else {
      // SPLIT INTO 4 BIKE BAYS
      for (let col = 0; col < 2; col++) {
        for (let row = 0; row < 2; row++) {
          const subIdx = col * 2 + row;
          slots.push({
            id: `S-B${(m + 1)}.${subIdx + 1}`,
            macroIndex: m + 10,
            subIndex: subIdx,
            sector: 'South',
            type: 'bike',
            x_m: macroX_m + col * DIMENSIONS.BIKE_BAY.width,
            y_m: southY_m + row * DIMENSIONS.BIKE_BAY.length,
            width_m: DIMENSIONS.BIKE_BAY.width,
            length_m: DIMENSIONS.BIKE_BAY.length,
            area_m2: DIMENSIONS.BIKE_BAY.area,
            facing: 'north',
            isEv: false,
            isAccessible: false,
          });
        }
      }
    }
    currentX_m += DIMENSIONS.CAR_BAY.width;
  }

  return slots;
}

/**
 * Calculate rigorous, geometric space utilization metrics
 */
export function calculateSpaceMetrics(slots, occupiedMap) {
  const totalParkableArea = getLotParkableArea(); // 286.0 m²
  let occupiedFootprint = 0;
  let occupiedBaysArea = 0;
  let carCount = 0;
  let bikeCount = 0;
  let carsInLayout = 0;
  let bikesInLayout = 0;

  slots.forEach(slot => {
    if (slot.type === 'car' || slot.type === 'ev' || slot.type === 'accessible') {
      carsInLayout++;
    } else if (slot.type === 'bike') {
      bikesInLayout++;
    }

    const occ = occupiedMap[slot.id];
    if (occ && occ.occupied) {
      occupiedBaysArea += slot.area_m2;
      if (occ.vehicleType === 'car') {
        carCount++;
        occupiedFootprint += DIMENSIONS.CAR_VEHICLE.area; // 7.74 m²
      } else if (occ.vehicleType === 'bike') {
        bikeCount++;
        occupiedFootprint += DIMENSIONS.BIKE_VEHICLE.area; // 1.60 m²
      }
    }
  });

  // Space utilization % = occupied vehicle footprint ÷ total parkable area
  const spaceUtilizationPercent = totalParkableArea > 0
    ? Number(((occupiedFootprint / totalParkableArea) * 100).toFixed(1))
    : 0;

  // Bay efficiency % = occupied vehicle footprint ÷ area of occupied bays
  const bayEfficiencyPercent = occupiedBaysArea > 0
    ? Number(((occupiedFootprint / occupiedBaysArea) * 100).toFixed(1))
    : 0;

  // Wasted area in m²
  const wastedAreaM2 = Number(Math.max(0, totalParkableArea - occupiedFootprint).toFixed(1));

  // Capacity comparison vs a standard fixed painted lot
  // In a fixed lot: 20 fixed car bays + 2 accessible bays = 22 cars max.
  // In fixed layout, if bikes arrive, they take up an entire car bay or only park in a fixed 2W strip.
  // Fixed baseline capacity for this footprint: 22 cars (or if 4 bays dedicated to bikes = 18 cars + 16 bikes = 34 vehicles).
  const fixedLayoutVehicleCapacity = 34; // 18 cars + 16 bikes
  const currentTotalVehiclesCapacity = carsInLayout + bikesInLayout;
  const capacityGainVehicles = Math.max(0, currentTotalVehiclesCapacity - fixedLayoutVehicleCapacity);
  const capacityGainPercent = Number(((capacityGainVehicles / fixedLayoutVehicleCapacity) * 100).toFixed(1));

  return {
    totalParkableArea: Number(totalParkableArea.toFixed(1)),
    occupiedFootprint: Number(occupiedFootprint.toFixed(1)),
    occupiedBaysArea: Number(occupiedBaysArea.toFixed(1)),
    spaceUtilizationPercent,
    bayEfficiencyPercent,
    wastedAreaM2,
    carCount,
    bikeCount,
    carsInLayout,
    bikesInLayout,
    currentTotalVehiclesCapacity,
    fixedLayoutVehicleCapacity,
    capacityGainVehicles,
    capacityGainPercent
  };
}
