import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Car, Bike, Zap, Accessibility, Ban, Play, RotateCcw, Sliders, Sparkles, CloudRain, Activity, ArrowRight, Cpu, Layers, AlertTriangle, X } from 'lucide-react';
import { 
  PX_PER_METER,
  DIMENSIONS,
  mToPx,
  pxToM,
  generateMeterLayout,
  getLotParkableArea,
  calculateSpaceMetrics,
  assertVehicleFits
} from '../utils/lotGeometry';
import { CarSprite, BikeSprite } from '../components/VehicleSprite';
import { wsClient } from '../services/ws';

export default function LiveDemoPage() {
  // Modes: '2w-peak' | 'car-peak' | 'balanced' | 'auto'
  const [activeMode, setActiveMode] = useState('balanced');
  const [demandRatio, setDemandRatio] = useState(50); // 0 (100% car) to 100 (100% bike)
  const [isMorphing, setIsMorphing] = useState(false);
  const [morphProgress, setMorphProgress] = useState(0);

  // Policy Toggles
  const [evPriority, setEvPriority] = useState(true);
  const [accessibleSlots, setAccessibleSlots] = useState(true);
  const [noEntryZone, setNoEntryZone] = useState(false);
  const [rainMode, setRainMode] = useState(false);
  const [allowBikeInCarBay, setAllowBikeInCarBay] = useState(false); // Overflow setting
  const [autoSimulate, setAutoSimulate] = useState(false);
  const [syncWithServer, setSyncWithServer] = useState(false);

  // Gate queue for waiting vehicles when lot is full of their type
  const [gateQueue, setGateQueue] = useState({ cars: 0, bikes: 0 });
  const [toastMessage, setToastMessage] = useState(null);

  // Vehicle arrival / departure animation state
  const [incomingType, setIncomingType] = useState('auto'); // 'auto' | 'car' | 'bike'
  const [isSimulatingArrival, setIsSimulatingArrival] = useState(false);
  const [guidedPath, setGuidedPath] = useState(null);
  const [movingVehicle, setMovingVehicle] = useState(null);

  // Selected slot for popover action modal
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [hoveredSlot, setHoveredSlot] = useState(null);

  // Occupied state dictionary: { [slotId]: { occupied: boolean, vehicleType: 'car'|'bike', vehicleNum: string, variant: string, isEv: boolean, entryTime: string, misaligned: boolean } }
  const [occupiedMap, setOccupiedMap] = useState(() => {
    const initial = {};
    const variants = ['blue', 'white', 'silver'];
    // Realistic initial seed of parked cars and bikes
    ['N-03', 'N-05', 'N-07', 'S-02', 'S-06', 'ACC-N1'].forEach((id, idx) => {
      initial[id] = {
        occupied: true,
        vehicleType: 'car',
        vehicleNum: `KA-01-CR-${1100 + idx * 7}`,
        variant: variants[idx % variants.length],
        isEv: id === 'N-05',
        entryTime: '09:15 AM',
        misaligned: false
      };
    });
    // Seed some initial bikes in balanced mode
    ['N-B1.1', 'N-B1.2', 'N-B2.1', 'S-B1.3', 'S-B1.4'].forEach((id, idx) => {
      initial[id] = {
        occupied: true,
        vehicleType: 'bike',
        vehicleNum: `KA-05-BK-${2020 + idx * 4}`,
        variant: 'teal',
        isEv: false,
        entryTime: '09:30 AM',
        misaligned: false
      };
    });
    return initial;
  });

  // Event telemetry logs
  const [logs, setLogs] = useState([
    { id: 1, time: '10:00:12', text: 'Geometric engine initialized. PX_PER_METER = 24 (1:42 real-world scale).', type: 'system', color: '#2563EB' },
    { id: 2, time: '10:01:05', text: 'Axiom verified: 1 Car Bay (12.5 m²) === 4 Two-Wheeler Bays (12.5 m²).', type: 'info', color: '#22C55E' },
    { id: 3, time: '10:02:18', text: 'Lot capacity: 286.0 m² parkable area strictly invariant across all modes.', type: 'feature', color: '#06B6D4' }
  ]);

  const addLog = (text, type = 'info', color = '#22C55E') => {
    const time = new Date().toTimeString().split(' ')[0];
    setLogs(prev => [{ id: Date.now() + Math.random(), time, text, type, color }, ...prev.slice(0, 39)]);
  };

  const showToast = (msg, isError = false) => {
    setToastMessage({ text: msg, isError });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Generate real meter-based slots for current mode and demand
  const currentSlots = useMemo(() => {
    return generateMeterLayout(activeMode, demandRatio);
  }, [activeMode, demandRatio]);

  // Compute live geometric space utilization metrics
  const spaceMetrics = useMemo(() => {
    return calculateSpaceMetrics(currentSlots, occupiedMap);
  }, [currentSlots, occupiedMap]);

  // Mode switching with smooth 2.0s morphing and automatic re-parking for misaligned vehicles
  const changeMode = (newMode) => {
    if (newMode === activeMode && !isMorphing) return;
    setActiveMode(newMode);
    setIsMorphing(true);
    setMorphProgress(0);

    addLog(`Layout mode changed to ${newMode.toUpperCase()}. Transforming modular bay geometry...`, 'system', '#2563EB');

    const startTime = Date.now();
    const duration = 2000;
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(100, Math.round((elapsed / duration) * 100));
      setMorphProgress(progress);
      if (elapsed >= duration) {
        clearInterval(interval);
        setIsMorphing(false);
        setMorphProgress(100);
        addLog(`Optical morph complete. All bays snapped to ${newMode.toUpperCase()} grid.`, 'info', '#22C55E');
      }
    }, 50);

    // After morph initiates, check for displaced vehicles whose previous bays no longer exist
    setTimeout(() => {
      const nextSlots = generateMeterLayout(newMode, demandRatio);
      const nextSlotIds = new Set(nextSlots.map(s => s.id));

      setOccupiedMap(prev => {
        const updated = { ...prev };
        const displacedVehicles = [];

        Object.keys(updated).forEach(oldId => {
          if (updated[oldId]?.occupied) {
            // Check if slot still exists
            const stillExists = nextSlotIds.has(oldId);
            const currentSlotDef = nextSlots.find(s => s.id === oldId);
            const isCar = updated[oldId].vehicleType === 'car';
            const isFit = currentSlotDef && (isCar ? currentSlotDef.type !== 'bike' : true);

            if (!stillExists || !isFit) {
              // Displaced or misaligned
              displacedVehicles.push({
                oldId,
                data: { ...updated[oldId], misaligned: true }
              });
              delete updated[oldId];
            }
          }
        });

        // Automatically re-park displaced vehicles into nearest valid free bays!
        if (displacedVehicles.length > 0) {
          addLog(`Reconfiguration displaced ${displacedVehicles.length} vehicles. Auto-relocating to valid bays...`, 'alert', '#F59E0B');
          
          displacedVehicles.forEach(({ oldId, data }) => {
            const validFreeSlots = nextSlots.filter(s => {
              if (updated[s.id]?.occupied) return false;
              if (data.vehicleType === 'car') return s.type === 'car' || s.type === 'ev' || s.type === 'accessible';
              return s.type === 'bike';
            });

            if (validFreeSlots.length > 0) {
              const target = validFreeSlots[0];
              updated[target.id] = { ...data, misaligned: false };
              addLog(`Vehicle [${data.vehicleNum}] safely re-parked from ${oldId} → Slot ${target.id}.`, 'feature', '#06B6D4');
            } else {
              // Add to gate queue
              setGateQueue(q => ({
                ...q,
                [data.vehicleType === 'car' ? 'cars' : 'bikes']: q[data.vehicleType === 'car' ? 'cars' : 'bikes'] + 1
              }));
              addLog(`No vacant bay for displaced ${data.vehicleType} [${data.vehicleNum}]. Moved to Gate Queue.`, 'alert', '#EF4444');
            }
          });
        }

        return updated;
      });
    }, 1100);
  };

  // Click on a slot: open popover
  const handleSlotClick = (slot) => {
    setSelectedSlot(slot);
  };

  // Perform manual park action from popover
  const executePark = (slot, vehicleType) => {
    const isCar = vehicleType === 'car';
    const variants = ['blue', 'white', 'silver'];
    const plate = isCar 
      ? `KA-01-CR-${Math.floor(1000 + Math.random() * 8999)}`
      : `KA-05-BK-${Math.floor(2000 + Math.random() * 7999)}`;

    setOccupiedMap(prev => ({
      ...prev,
      [slot.id]: {
        occupied: true,
        vehicleType,
        vehicleNum: plate,
        variant: variants[Math.floor(Math.random() * variants.length)],
        isEv: slot.isEv,
        entryTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        misaligned: false,
        isOverflow: isCar ? false : (slot.type === 'car' || slot.type === 'accessible')
      }
    }));

    addLog(`Manually parked ${vehicleType.toUpperCase()} [${plate}] in Slot ${slot.id}.`, 'info', '#22C55E');
    setSelectedSlot(null);
  };

  // Vacate slot action
  const executeVacate = (slotId) => {
    const info = occupiedMap[slotId];
    setOccupiedMap(prev => {
      const copy = { ...prev };
      delete copy[slotId];
      return copy;
    });

    addLog(`Slot ${slotId} vacated (Vehicle ${info?.vehicleNum || 'Departed'}).`, 'info', '#22C55E');
    setSelectedSlot(null);

    // If vehicles are waiting in gate queue, immediately guide one in!
    if (gateQueue.cars > 0 && (selectedSlot?.type === 'car' || selectedSlot?.type === 'accessible')) {
      setGateQueue(q => ({ ...q, cars: q.cars - 1 }));
      setTimeout(() => simulateArrival('car'), 500);
    } else if (gateQueue.bikes > 0 && selectedSlot?.type === 'bike') {
      setGateQueue(q => ({ ...q, bikes: q.bikes - 1 }));
      setTimeout(() => simulateArrival('bike'), 500);
    }
  };

  // Simulate vehicle arrival with real-scale trajectory
  const simulateArrival = (forcedType = null) => {
    if (isSimulatingArrival) return;

    let vType = forcedType || incomingType;
    if (vType === 'auto') {
      vType = Math.random() > (demandRatio / 100) ? 'car' : 'bike';
    }

    // Filter available matching slots
    let availableSlots = currentSlots.filter(s => {
      if (occupiedMap[s.id]?.occupied) return false;
      if (noEntryZone && s.sector === 'South' && s.x_m > 12 && s.x_m < 22) return false; // Hazard zone
      if (vType === 'car') {
        return s.type === 'car' || s.type === 'ev' || s.type === 'accessible';
      } else {
        return s.type === 'bike' || (allowBikeInCarBay && s.type === 'car');
      }
    });

    if (availableSlots.length === 0) {
      showToast(`No free ${vType.toUpperCase()} bay available in lot! Vehicle queued at gate.`, true);
      setGateQueue(q => ({ ...q, [vType === 'car' ? 'cars' : 'bikes']: q[vType === 'car' ? 'cars' : 'bikes'] + 1 }));
      addLog(`GATE QUEUE +1: No vacant ${vType.toUpperCase()} bay. Vehicle holding at Entry Gate.`, 'alert', '#EF4444');
      return;
    }

    // Sort by distance to entry gate (X: 1.5m, Y: 8.95m)
    availableSlots.sort((a, b) => {
      const distA = Math.hypot(a.x_m - 1.5, a.y_m - 8.95);
      const distB = Math.hypot(b.x_m - 1.5, b.y_m - 8.95);
      return distA - distB;
    });

    const target = availableSlots[0];
    const plate = vType === 'car'
      ? `KA-03-CR-${Math.floor(1000 + Math.random() * 8999)}`
      : `KA-05-BK-${Math.floor(2000 + Math.random() * 7999)}`;
    const variants = ['blue', 'white', 'silver'];
    const variant = variants[Math.floor(Math.random() * variants.length)];

    setIsSimulatingArrival(true);

    // Coordinates in pixels
    const entryPxX = mToPx(1.5);
    const entryPxY = mToPx(8.95); // driving lane center
    const lanePxY = mToPx(8.95);
    const targetPxX = mToPx(target.x_m + target.width_m / 2);
    const targetPxY = mToPx(target.y_m + target.length_m / 2);

    // Build laser path SVG string: Entry -> Lane -> Target Bay
    const pathD = `M ${entryPxX} ${entryPxY} H ${targetPxX} V ${targetPxY}`;
    setGuidedPath({
      d: pathD,
      targetId: target.id,
      plate,
      type: vType
    });

    // Rotation angles along the route:
    // Moving along lane east: 90 deg
    // Turning North: 0 deg
    // Turning South: 180 deg
    const finalRotation = target.facing === 'south' ? 0 : 180;

    addLog(`Incoming ${vType === 'car' ? 'Car' : '2-Wheeler'} [${plate}] at Entry Gate. Laser trajectory locked on Slot ${target.id}.`, 'feature', '#06B6D4');

    setMovingVehicle({
      type: vType,
      plate,
      variant,
      isEv: target.isEv,
      startX: entryPxX,
      startY: entryPxY,
      laneY: lanePxY,
      targetX: targetPxX,
      targetY: targetPxY,
      finalRotation,
      isExit: false
    });

    setTimeout(() => {
      setOccupiedMap(prev => ({
        ...prev,
        [target.id]: {
          occupied: true,
          vehicleType: vType,
          vehicleNum: plate,
          variant,
          isEv: target.isEv,
          entryTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          misaligned: false,
          isOverflow: vType === 'bike' && target.type !== 'bike'
        }
      }));

      addLog(`Vehicle [${plate}] safely parked in Slot ${target.id}. Laser guidance deactivated.`, 'system', '#22C55E');
      setIsSimulatingArrival(false);
      setMovingVehicle(null);
      setTimeout(() => setGuidedPath(null), 500);
    }, 2200);
  };

  // Simulate vehicle departure along lane toward exit gate (X: 33.5m, Y: 8.95m)
  const simulateDeparture = () => {
    const occupiedKeys = Object.keys(occupiedMap).filter(k => occupiedMap[k]?.occupied);
    if (occupiedKeys.length === 0) {
      showToast('No parked vehicles in the lot to exit.');
      return;
    }

    const randomSlotId = occupiedKeys[Math.floor(Math.random() * occupiedKeys.length)];
    const slot = currentSlots.find(s => s.id === randomSlotId);
    if (!slot) return;

    const vInfo = occupiedMap[randomSlotId];
    const plate = vInfo.vehicleNum;

    // Remove from occupied map
    setOccupiedMap(prev => {
      const copy = { ...prev };
      delete copy[randomSlotId];
      return copy;
    });

    const startPxX = mToPx(slot.x_m + slot.width_m / 2);
    const startPxY = mToPx(slot.y_m + slot.length_m / 2);
    const lanePxY = mToPx(8.95);
    const exitPxX = mToPx(33.5);

    setMovingVehicle({
      type: vInfo.vehicleType,
      plate,
      variant: vInfo.variant,
      isEv: vInfo.isEv,
      startX: startPxX,
      startY: startPxY,
      laneY: lanePxY,
      targetX: exitPxX,
      targetY: lanePxY,
      finalRotation: 90, // Facing east exit
      isExit: true
    });

    addLog(`Vehicle [${plate}] vacated Slot ${randomSlotId} and exited via East Gate.`, 'info', '#22C55E');

    setTimeout(() => {
      setMovingVehicle(null);
    }, 2000);
  };

  // Reset simulation lot
  const handleReset = () => {
    setOccupiedMap({});
    setGateQueue({ cars: 0, bikes: 0 });
    setGuidedPath(null);
    setMovingVehicle(null);
    setIsSimulatingArrival(false);
    setSelectedSlot(null);
    addLog('Simulation lot reset to 100% vacant baseline.', 'system', '#2563EB');
  };

  // Auto-simulate continuous cycle
  useEffect(() => {
    if (!autoSimulate) return;
    const interval = setInterval(() => {
      const roll = Math.random();
      if (roll < 0.6) {
        simulateArrival();
      } else {
        simulateDeparture();
      }
    }, 3800);
    return () => clearInterval(interval);
  }, [autoSimulate, currentSlots, occupiedMap, isSimulatingArrival, demandRatio, noEntryZone, allowBikeInCarBay]);

  // Overall SVG Lot dimensions in pixels
  const lotWidthPx = mToPx(DIMENSIONS.LOT.MARGIN_LEFT + DIMENSIONS.ACCESSIBLE_BAY.width + DIMENSIONS.LOT.MODULAR_BAYS_PER_ROW * DIMENSIONS.CAR_BAY.width + DIMENSIONS.LOT.MARGIN_RIGHT); // ~830 px
  const lotHeightPx = mToPx(DIMENSIONS.LOT.MARGIN_TOP + DIMENSIONS.CAR_BAY.length + DIMENSIONS.LOT.DRIVEWAY_WIDTH + DIMENSIONS.CAR_BAY.length + DIMENSIONS.LOT.MARGIN_BOTTOM); // ~430 px

  return (
    <div className="space-y-6">
      
      {/* 1. Header Toolbar (App Style, Clean Title with Scale Spec & Reset) */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-primary flex items-center justify-center font-bold">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-darkNavy tracking-tight">Live Demo</h1>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-availableGreen/10 text-availableGreen border border-availableGreen/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-availableGreen animate-ping"></span>
                Real-World Scale (1:42)
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              1 Car Bay (2.5×5.0m = 12.5m²) ≡ 4 Two-Wheeler Bays (2×2 of 1.25×2.5m) • Scale: 24 px/m
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Gate Queue Badge */}
          {(gateQueue.cars > 0 || gateQueue.bikes > 0) && (
            <div className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold flex items-center gap-1.5 animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>Gate Queue: {gateQueue.cars} Car, {gateQueue.bikes} 2W</span>
            </div>
          )}

          {/* Reset button */}
          <button
            onClick={handleReset}
            className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Floating Toast Message */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-20 right-8 z-50 px-4 py-2.5 rounded-xl shadow-lg border text-xs font-bold flex items-center gap-2 ${
              toastMessage.isError
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-blue-50 border-blue-200 text-blue-800'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-occupiedRed" />
            <span>{toastMessage.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Main Two-Column Layout (70% Lot / 30% Control Panel) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Real-Scale Animated Lot & Event Log (70% on lg) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* REAL GEOMETRIC METRICS ROW */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-medium text-slate-500 block">Total Parkable Area</span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-xl font-bold text-darkNavy">{spaceMetrics.totalParkableArea} m²</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Strict Constant</span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-medium text-slate-500 block">Occupied Footprint</span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-2 h-2 rounded-full bg-occupiedRed"></span>
                <span className="text-xl font-bold text-occupiedRed">{spaceMetrics.occupiedFootprint} m²</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Real Vehicle Area</span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-medium text-slate-500 block">Space Utilization</span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-xl font-bold text-primary">{spaceMetrics.spaceUtilizationPercent}%</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Footprint ÷ Lot Area</span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-medium text-slate-500 block">Bay Efficiency</span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-xl font-bold text-teal-600">{spaceMetrics.bayEfficiencyPercent}%</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Tight Bay Packing</span>
            </div>

            <div className="col-span-2 sm:col-span-1 bg-gradient-to-br from-blue-50 to-emerald-50 p-3.5 rounded-2xl border border-emerald-200 shadow-sm">
              <span className="text-[11px] font-medium text-emerald-800 block">Capacity Gain</span>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-xl font-black text-emerald-600">+{spaceMetrics.capacityGainVehicles} bays</span>
              </div>
              <span className="text-[10px] text-emerald-700 font-mono">+{spaceMetrics.capacityGainPercent}% vs Fixed</span>
            </div>
          </div>

          {/* ANIMATED PARKING LOT CONTAINER */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 relative overflow-hidden">
            
            {/* Top Toolbar inside lot */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600">Active Mode:</span>
                <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-primary text-white uppercase tracking-wider">
                  {activeMode.replace('-', ' ')}
                </span>
                {isMorphing && (
                  <span className="text-xs text-primary font-mono flex items-center gap-1 animate-pulse">
                    <Sparkles className="w-3.5 h-3.5 text-availableGreen animate-spin" />
                    Morphing Geometry ({morphProgress}%)
                  </span>
                )}
              </div>

              {/* Rain mode active banner */}
              {rainMode && (
                <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[11px] font-medium">
                  <CloudRain className="w-3.5 h-3.5 text-primary" />
                  <span>500Hz Pulse Intensified</span>
                </div>
              )}
            </div>

            {/* Transition Progress Bar during Morphing */}
            {isMorphing && (
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                <div 
                  className="h-full bg-gradient-to-r from-primary to-availableGreen transition-all duration-75"
                  style={{ width: `${morphProgress}%` }}
                />
              </div>
            )}

            {/* Interactive Real-Scale SVG Parking Lot */}
            <div className="relative w-full aspect-[16/9] bg-[#0A0F1D] rounded-xl overflow-hidden border border-slate-800 shadow-inner">
              
              {/* Rain Particle Overlay if Rain Mode is ON */}
              {rainMode && (
                <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden bg-blue-950/20 backdrop-blur-[0.5px]">
                  <svg className="w-full h-full opacity-60">
                    <defs>
                      <pattern id="rainPattern" width="40" height="40" patternUnits="userSpaceOnUse">
                        <line x1="5" y1="0" x2="0" y2="20" stroke="#93C5FD" strokeWidth="1.2" opacity="0.8" />
                        <line x1="25" y1="10" x2="20" y2="30" stroke="#93C5FD" strokeWidth="1.2" opacity="0.8" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#rainPattern)" className="animate-pulse" />
                  </svg>
                </div>
              )}

              {/* The SVG Canvas */}
              <svg
                className="w-full h-full"
                viewBox="0 0 860 450"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  {/* Glowing Laser Filters */}
                  <filter id="laserGlowGreen" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation={rainMode ? "4.5" : "3"} result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <filter id="laserGlowRed" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <filter id="laserGlowBlue" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation={rainMode ? "4.5" : "2.5"} result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <filter id="laserGlowAmber" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="3.5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {/* Ground Deck Surface */}
                <rect x="15" y="15" width="830" height="420" rx="14" fill="#0B1120" stroke="#1E293B" strokeWidth="2" />
                
                {/* 5.5m Driving Lane (Asphalt Roadway) */}
                {/* From y_m = 6.2m (148.8px) to 11.7m (280.8px), height = 132px */}
                <rect x="25" y={mToPx(6.2)} width="810" height={mToPx(5.5)} fill="#070C18" rx="6" />
                <path d={`M 30 ${mToPx(6.2)} H 835`} stroke="#334155" strokeWidth="1.5" strokeDasharray="8 6" />
                <path d={`M 30 ${mToPx(11.7)} H 835`} stroke="#334155" strokeWidth="1.5" strokeDasharray="8 6" />
                
                {/* Center Roadway Dashed Marking */}
                <path d={`M 30 ${mToPx(8.95)} H 835`} stroke="#2563EB" strokeWidth="1.5" strokeDasharray="12 10" strokeOpacity="0.5" />

                {/* Lane Direction Chevrons */}
                <g fill="#475569" opacity="0.6">
                  <path d={`M 180 ${mToPx(8.95) - 5} L 195 ${mToPx(8.95)} L 180 ${mToPx(8.95) + 5} Z`} />
                  <path d={`M 440 ${mToPx(8.95) - 5} L 455 ${mToPx(8.95)} L 440 ${mToPx(8.95) + 5} Z`} />
                  <path d={`M 700 ${mToPx(8.95) - 5} L 715 ${mToPx(8.95)} L 700 ${mToPx(8.95) + 5} Z`} />
                </g>

                <text x="450" y={mToPx(8.95) + 4} fill="#64748B" fontSize="10" fontWeight="bold" textAnchor="middle" letterSpacing="1.5">
                  5.5m DRIVING LANE (1-WAY TRANSIT)
                </text>

                {/* ENTRY GATE (West / Left) */}
                <g id="entry-gate">
                  <rect x="18" y={mToPx(7.45)} width="36" height={mToPx(3.0)} rx="5" fill="#1E3A8A" fillOpacity="0.7" stroke="#2563EB" strokeWidth="2" filter="url(#laserGlowBlue)" />
                  <text x="36" y={mToPx(8.7)} textAnchor="middle" fill="#93C5FD" fontSize="8" fontWeight="bold">
                    IN
                  </text>
                  <text x="36" y={mToPx(9.3)} textAnchor="middle" fill="#FFFFFF" fontSize="7" fontWeight="bold">
                    GATE
                  </text>
                </g>

                {/* EXIT GATE (East / Right) */}
                <g id="exit-gate">
                  <rect x="806" y={mToPx(7.45)} width="36" height={mToPx(3.0)} rx="5" fill="#065F46" fillOpacity="0.7" stroke="#22C55E" strokeWidth="2" filter="url(#laserGlowGreen)" />
                  <text x="824" y={mToPx(8.7)} textAnchor="middle" fill="#6EE7B7" fontSize="8" fontWeight="bold">
                    OUT
                  </text>
                  <text x="824" y={mToPx(9.3)} textAnchor="middle" fill="#FFFFFF" fontSize="7" fontWeight="bold">
                    GATE
                  </text>
                </g>

                {/* NO ENTRY HAZARD BARRIER OVERLAY IF TOGGLED */}
                {noEntryZone && (
                  <g id="no-entry-hatch">
                    <rect x={mToPx(13.0)} y={mToPx(6.4)} width={mToPx(10.0)} height={mToPx(5.1)} rx="6" fill="#7F1D1D" fillOpacity="0.35" stroke="#EF4444" strokeWidth="2" strokeDasharray="6 4" filter="url(#laserGlowRed)" />
                    {/* Diagonal hatch lines */}
                    <line x1={mToPx(14.0)} y1={mToPx(6.4)} x2={mToPx(16.5)} y2={mToPx(11.5)} stroke="#EF4444" strokeWidth="1.5" />
                    <line x1={mToPx(17.0)} y1={mToPx(6.4)} x2={mToPx(19.5)} y2={mToPx(11.5)} stroke="#EF4444" strokeWidth="1.5" />
                    <line x1={mToPx(20.0)} y1={mToPx(6.4)} x2={mToPx(22.5)} y2={mToPx(11.5)} stroke="#EF4444" strokeWidth="1.5" />
                    {/* Restricted icon */}
                    <circle cx={mToPx(18.0)} cy={mToPx(8.95)} r="14" fill="#EF4444" />
                    <rect x={mToPx(18.0) - 9} y={mToPx(8.95) - 2.5} width="18" height="5" fill="#FFFFFF" rx="1.5" />
                    <text x={mToPx(18.0)} y={mToPx(11.0)} textAnchor="middle" fill="#FCA5A5" fontSize="9" fontWeight="bold">
                      NO ENTRY (RESTRICTED SECTION)
                    </text>
                  </g>
                )}

                {/* RENDER ALL REAL-SCALE SLOTS */}
                {currentSlots.map((slot) => {
                  const occInfo = occupiedMap[slot.id];
                  const isOccupied = !!occInfo?.occupied;
                  const isMisaligned = !!occInfo?.misaligned;
                  const isOverflow = !!occInfo?.isOverflow;
                  const isTarget = guidedPath && guidedPath.targetId === slot.id;
                  const isBikeBay = slot.type === 'bike';

                  const slotPxX = mToPx(slot.x_m);
                  const slotPxY = mToPx(slot.y_m);
                  const slotPxW = mToPx(slot.width_m);
                  const slotPxL = mToPx(slot.length_m);

                  // Colors: Red if occupied, Green if free, Amber if misaligned or overflow
                  let strokeColor = isOccupied ? '#EF4444' : '#22C55E';
                  let fillColor = isOccupied ? '#1F1722' : '#042F24';
                  let filterUrl = isOccupied ? 'url(#laserGlowRed)' : 'url(#laserGlowGreen)';

                  if (isMisaligned || isOverflow) {
                    strokeColor = '#F59E0B';
                    fillColor = '#2D1F07';
                    filterUrl = 'url(#laserGlowAmber)';
                  } else if (isTarget) {
                    strokeColor = '#06B6D4';
                    fillColor = '#083344';
                    filterUrl = 'url(#laserGlowBlue)';
                  }

                  // Rotation of parked vehicle:
                  // North bays point nose down to lane (rotation 0)
                  // South bays point nose up to lane (rotation 180)
                  const spriteRotation = slot.facing === 'south' ? 0 : 180;

                  return (
                    <g
                      key={slot.id}
                      onClick={() => handleSlotClick(slot)}
                      onMouseEnter={() => setHoveredSlot(slot)}
                      onMouseLeave={() => setHoveredSlot(null)}
                      className="cursor-pointer group"
                    >
                      {/* Animated Slot Outline (Framer Motion) */}
                      <motion.rect
                        layout
                        initial={false}
                        animate={{
                          x: slotPxX,
                          y: slotPxY,
                          width: slotPxW,
                          height: slotPxL,
                        }}
                        transition={{
                          type: 'spring',
                          stiffness: 80,
                          damping: 18,
                          duration: 1.8
                        }}
                        rx="4"
                        fill={fillColor}
                        fillOpacity={isOccupied ? 0.75 : 0.4}
                        stroke={strokeColor}
                        strokeWidth={isTarget ? 2.5 : isBikeBay ? 1.2 : 1.8}
                        strokeDasharray={isBikeBay ? '4 2' : 'none'}
                        filter={filterUrl}
                      />

                      {/* Small slot label at closed end */}
                      <text
                        x={slotPxX + slotPxW / 2}
                        y={slot.facing === 'south' ? slotPxY + 11 : slotPxY + slotPxL - 5}
                        textAnchor="middle"
                        fill={isMisaligned ? '#F59E0B' : isOccupied ? '#EF4444' : '#22C55E'}
                        fontSize={isBikeBay ? '7' : '9'}
                        fontWeight="bold"
                        className="select-none pointer-events-none"
                      >
                        {slot.id}
                      </text>

                      {/* EV Glyph */}
                      {evPriority && slot.isEv && !isOccupied && (
                        <g transform={`translate(${slotPxX + slotPxW / 2}, ${slotPxY + slotPxL / 2})`}>
                          <circle cx="0" cy="0" r="7" fill="#06B6D4" fillOpacity="0.2" stroke="#06B6D4" strokeWidth="1" />
                          <path d="M 1 -4 L -2 0 H 2 L -1 4" stroke="#06B6D4" strokeWidth="1.2" fill="none" />
                        </g>
                      )}

                      {/* Accessible Wheelchair Glyph */}
                      {accessibleSlots && slot.isAccessible && !isOccupied && (
                        <g transform={`translate(${slotPxX + slotPxW / 2}, ${slotPxY + slotPxL / 2})`}>
                          <circle cx="0" cy="0" r="9" fill="#8B5CF6" fillOpacity="0.25" stroke="#8B5CF6" strokeWidth="1.2" />
                          <text x="0" y="3" textAnchor="middle" fill="#C4B5FD" fontSize="9" fontWeight="bold">♿</text>
                        </g>
                      )}

                      {/* REAL-SCALE PARKED VEHICLE SPRITE (CENTERED WITH EXACT MARGINS) */}
                      {isOccupied && (
                        <g transform={`translate(${slotPxX + slotPxW / 2}, ${slotPxY + slotPxL / 2})`}>
                          {occInfo.vehicleType === 'bike' ? (
                            <BikeSprite rotation={spriteRotation} plate={occInfo.vehicleNum} />
                          ) : (
                            <CarSprite
                              variant={occInfo.variant || 'blue'}
                              isEv={occInfo.isEv}
                              rotation={spriteRotation}
                              plate={occInfo.vehicleNum}
                            />
                          )}

                          {/* Overflow indicator if bike is parked in car bay */}
                          {isOverflow && (
                            <text y="28" textAnchor="middle" fill="#F59E0B" fontSize="6" fontWeight="bold">
                              WASTED 9.4m²
                            </text>
                          )}
                        </g>
                      )}

                      {/* MISALIGNED AMBER BADGE */}
                      {isMisaligned && (
                        <g transform={`translate(${slotPxX + slotPxW / 2}, ${slotPxY + slotPxL / 2})`}>
                          <rect x="-20" y="-8" width="40" height="16" rx="3" fill="#F59E0B" />
                          <text y="3" textAnchor="middle" fill="#0F172A" fontSize="7" fontWeight="bold">
                            MISALIGNED
                          </text>
                        </g>
                      )}

                      {/* FREE GREEN PULSING DOT IF AVAILABLE */}
                      {!isOccupied && (
                        <circle
                          cx={slotPxX + slotPxW / 2}
                          cy={slotPxY + slotPxL / 2}
                          r={isBikeBay ? 3 : 5}
                          fill="#22C55E"
                          fillOpacity="0.6"
                          className="animate-pulse"
                        />
                      )}
                    </g>
                  );
                })}

                {/* ANIMATED GUIDED LASER TRAJECTORY */}
                {guidedPath && (
                  <g id="laser-guidance-path">
                    <path
                      d={guidedPath.d}
                      fill="none"
                      stroke="#22C55E"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray="8 6"
                      filter="url(#laserGlowGreen)"
                    />
                  </g>
                )}

                {/* MOVING VEHICLE SPRITE ALONG TRAJECTORY (ROTATES ALONG DIRECTION) */}
                {movingVehicle && (
                  <motion.g
                    initial={{
                      x: movingVehicle.startX,
                      y: movingVehicle.startY,
                    }}
                    animate={{
                      x: [
                        movingVehicle.startX,
                        movingVehicle.targetX,
                        movingVehicle.targetX
                      ],
                      y: [
                        movingVehicle.startY,
                        movingVehicle.laneY,
                        movingVehicle.targetY
                      ],
                    }}
                    transition={{
                      duration: 2.1,
                      ease: 'easeInOut',
                      times: [0, 0.65, 1],
                    }}
                  >
                    {movingVehicle.type === 'bike' ? (
                      <BikeSprite rotation={movingVehicle.finalRotation} plate={movingVehicle.plate} />
                    ) : (
                      <CarSprite
                        variant={movingVehicle.variant || 'blue'}
                        isEv={movingVehicle.isEv}
                        rotation={movingVehicle.finalRotation}
                        plate={movingVehicle.plate}
                      />
                    )}
                  </motion.g>
                )}

                {/* 5-METER SCALE BAR IN BOTTOM-RIGHT CORNER */}
                <g id="scale-bar" transform="translate(680, 415)">
                  {/* 5 meters = 120 pixels */}
                  <line x1="0" y1="0" x2="120" y2="0" stroke="#94A3B8" strokeWidth="2" />
                  <line x1="0" y1="-5" x2="0" y2="5" stroke="#94A3B8" strokeWidth="2" />
                  <line x1="60" y1="-3" x2="60" y2="3" stroke="#94A3B8" strokeWidth="1.5" />
                  <line x1="120" y1="-5" x2="120" y2="5" stroke="#94A3B8" strokeWidth="2" />
                  <text x="0" y="-8" fill="#94A3B8" fontSize="8" fontWeight="bold">0</text>
                  <text x="60" y="-8" textAnchor="middle" fill="#94A3B8" fontSize="8" fontWeight="bold">2.5m</text>
                  <text x="120" y="-8" textAnchor="end" fill="#94A3B8" fontSize="8" fontWeight="bold">5.0m</text>
                  <text x="60" y="14" textAnchor="middle" fill="#64748B" fontSize="8" fontWeight="mono">
                    SCALE: 5 METERS (1:42)
                  </text>
                </g>
              </svg>

              {/* Hover Tooltip Overlay */}
              {hoveredSlot && (
                <div className="absolute top-3 left-3 bg-slate-900/95 text-white px-3 py-2 rounded-xl border border-slate-700 shadow-xl pointer-events-none text-xs font-mono space-y-0.5 z-30">
                  <div className="font-bold text-primary flex items-center justify-between gap-4">
                    <span>{hoveredSlot.id} • {hoveredSlot.type.toUpperCase()} BAY</span>
                    <span className="text-slate-400">{hoveredSlot.width_m} × {hoveredSlot.length_m} m</span>
                  </div>
                  <div className="text-[11px] text-slate-300">
                    Area: <span className="font-bold text-white">{hoveredSlot.area_m2} m²</span> • Status: <span className={occupiedMap[hoveredSlot.id]?.occupied ? 'text-occupiedRed font-bold' : 'text-availableGreen font-bold'}>{occupiedMap[hoveredSlot.id]?.occupied ? 'OCCUPIED' : 'VACANT'}</span>
                  </div>
                  {occupiedMap[hoveredSlot.id]?.occupied && (
                    <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800 flex justify-between gap-3">
                      <span>Vehicle: {occupiedMap[hoveredSlot.id].vehicleNum}</span>
                      <span className="text-emerald-400">Efficiency: {hoveredSlot.type === 'car' ? '61.9%' : '51.2%'}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quick Simulation Action Bar below Lot */}
            <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-100">
              
              <div className="flex flex-wrap items-center gap-2">
                {/* Vehicle Selector */}
                <div className="flex items-center rounded-xl bg-slate-100 p-0.5 text-xs font-semibold">
                  <button
                    onClick={() => setIncomingType('auto')}
                    className={`px-2.5 py-1.5 rounded-lg transition-all ${
                      incomingType === 'auto' ? 'bg-white text-darkNavy shadow-sm' : 'text-slate-500 hover:text-darkNavy'
                    }`}
                  >
                    Auto Mix
                  </button>
                  <button
                    onClick={() => setIncomingType('car')}
                    className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                      incomingType === 'car' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-darkNavy'
                    }`}
                  >
                    <Car className="w-3.5 h-3.5" />
                    <span>Car (1.8×4.3m)</span>
                  </button>
                  <button
                    onClick={() => setIncomingType('bike')}
                    className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                      incomingType === 'bike' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-darkNavy'
                    }`}
                  >
                    <Bike className="w-3.5 h-3.5" />
                    <span>2W (0.8×2.0m)</span>
                  </button>
                </div>

                {/* Simulate Arrival Button */}
                <button
                  disabled={isSimulatingArrival}
                  onClick={() => simulateArrival()}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Simulate Arrival</span>
                </button>

                {/* Simulate Departure Button */}
                <button
                  onClick={simulateDeparture}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>Simulate Exit</span>
                </button>
              </div>

              {/* Auto-simulate Toggle */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">Auto Influx Cycle:</span>
                <button
                  onClick={() => setAutoSimulate(!autoSimulate)}
                  className={`w-10 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                    autoSimulate ? 'bg-availableGreen' : 'bg-slate-200'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      autoSimulate ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

            </div>

          </div>

          {/* COMPACT EVENT LOG CARD (Below the Lot) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-darkNavy">Live Event Log</h3>
              </div>
              <span className="text-[11px] font-mono text-slate-400">Telemetry Stream (Newest first)</span>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-2 pr-1 font-mono text-xs">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 border border-slate-100 text-slate-700"
                >
                  <span
                    className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                    style={{ backgroundColor: log.color }}
                  />
                  <span className="text-[10px] text-slate-400 shrink-0">[{log.time}]</span>
                  <span className="text-[11px] font-medium leading-relaxed">{log.text}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: CONTROL PANEL (~30% on lg) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* 1. ADAPTIVE MODE BUTTONS */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-darkNavy uppercase tracking-wider">
                Adaptive Modes
              </h3>
              <span className="text-[10px] font-mono bg-blue-50 text-primary px-2 py-0.5 rounded font-bold">
                1 CAR ≡ 4 2W
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => changeMode('2w-peak')}
                className={`p-3 rounded-xl text-left border transition-all cursor-pointer ${
                  activeMode === '2w-peak'
                    ? 'bg-blue-50 border-primary text-primary font-bold shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <Bike className="w-4 h-4 text-teal-600" />
                  <span className="text-[10px] font-mono font-bold">76 Bays</span>
                </div>
                <div className="text-xs font-bold">2W Peak</div>
                <div className="text-[10px] text-slate-500">2 Car + 72 Bike + 2 Acc</div>
              </button>

              <button
                onClick={() => changeMode('car-peak')}
                className={`p-3 rounded-xl text-left border transition-all cursor-pointer ${
                  activeMode === 'car-peak'
                    ? 'bg-blue-50 border-primary text-primary font-bold shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <Car className="w-4 h-4 text-primary" />
                  <span className="text-[10px] font-mono font-bold">28 Bays</span>
                </div>
                <div className="text-xs font-bold">Car Peak</div>
                <div className="text-[10px] text-slate-500">18 Car + 8 Bike + 2 Acc</div>
              </button>

              <button
                onClick={() => changeMode('balanced')}
                className={`p-3 rounded-xl text-left border transition-all cursor-pointer ${
                  activeMode === 'balanced'
                    ? 'bg-blue-50 border-primary text-primary font-bold shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  <span className="text-[10px] font-mono font-bold">52 Bays</span>
                </div>
                <div className="text-xs font-bold">Balanced</div>
                <div className="text-[10px] text-slate-500">10 Car + 40 Bike + 2 Acc</div>
              </button>

              <button
                onClick={() => changeMode('auto')}
                className={`p-3 rounded-xl text-left border transition-all cursor-pointer ${
                  activeMode === 'auto'
                    ? 'bg-emerald-50 border-availableGreen text-emerald-800 font-bold shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <Cpu className="w-4 h-4 text-availableGreen" />
                  <span className="text-[10px] font-mono font-bold text-availableGreen">AI DYNAMIC</span>
                </div>
                <div className="text-xs font-bold">Auto (AI)</div>
                <div className="text-[10px] text-slate-500">Continuous ratio optimization</div>
              </button>
            </div>
          </div>

          {/* 2. DEMAND RATIO SLIDER */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-darkNavy uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-primary" />
                Demand Ratio Slider
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-50 text-primary border border-blue-200">
                {demandRatio}% 2W / {100 - demandRatio}% Car
              </span>
            </div>

            <input
              type="range"
              min="0"
              max="100"
              value={demandRatio}
              onChange={(e) => {
                const val = Number(e.target.value);
                setDemandRatio(val);
                if (activeMode !== 'auto') {
                  setActiveMode('auto');
                  addLog(`Demand adjusted to ${val}% 2W. Auto mode morphing lot.`, 'system', '#2563EB');
                }
              }}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
            />

            <div className="flex justify-between text-[11px] font-semibold text-slate-500">
              <span>🚗 100% Car Demand</span>
              <span>🏍️ 100% 2W Demand</span>
            </div>

            {/* REAL BEFORE / AFTER CAPACITY BAR */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <div className="text-xs font-bold text-darkNavy flex justify-between">
                <span>Fixed Painted Layout:</span>
                <span className="font-mono text-slate-600">34 vehicles max</span>
              </div>
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div className="bg-slate-400 h-full rounded-full" style={{ width: '45%' }}></div>
              </div>

              <div className="text-xs font-bold text-darkNavy flex justify-between pt-1">
                <span>Bharat Adaptive Layout:</span>
                <span className="font-mono text-availableGreen font-extrabold">{spaceMetrics.currentTotalVehiclesCapacity} vehicles max (+{spaceMetrics.capacityGainPercent}%)</span>
              </div>
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-primary to-availableGreen h-full rounded-full transition-all duration-300" 
                  style={{ width: `${Math.min(100, (spaceMetrics.currentTotalVehiclesCapacity / 76) * 100)}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* 3. OPTICAL GUIDANCE TOGGLES & OVERFLOW SETTING */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3.5">
            <h4 className="text-xs font-bold text-darkNavy uppercase tracking-wider mb-2">
              Guidance & Barrier Rules
            </h4>

            {/* EV Priority Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-cyan-100 text-cyan-700">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-darkNavy block">EV Priority Bays</span>
                  <span className="text-[10px] text-slate-500">Designated charging slots</span>
                </div>
              </div>
              <button
                onClick={() => {
                  setEvPriority(!evPriority);
                  addLog(`EV Priority overlay ${!evPriority ? 'ENABLED' : 'DISABLED'}.`, 'feature', '#06B6D4');
                }}
                className={`w-10 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                  evPriority ? 'bg-primary' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    evPriority ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Accessibility Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-purple-100 text-purple-700">
                  <Accessibility className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-darkNavy block">Accessible (3.6×5.0m)</span>
                  <span className="text-[10px] text-slate-500">Wider bays near entrance</span>
                </div>
              </div>
              <button
                onClick={() => {
                  setAccessibleSlots(!accessibleSlots);
                  addLog(`Accessibility overlay ${!accessibleSlots ? 'ENABLED' : 'DISABLED'}.`, 'feature', '#8B5CF6');
                }}
                className={`w-10 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                  accessibleSlots ? 'bg-primary' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    accessibleSlots ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* No Entry Zone Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-red-100 text-occupiedRed">
                  <Ban className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-darkNavy block">No Entry Zone</span>
                  <span className="text-[10px] text-slate-500">Red laser hatch barrier</span>
                </div>
              </div>
              <button
                onClick={() => {
                  setNoEntryZone(!noEntryZone);
                  addLog(`Hazard No-Entry Zone ${!noEntryZone ? 'ACTIVATED' : 'CLEARED'}.`, 'alert', '#EF4444');
                }}
                className={`w-10 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                  noEntryZone ? 'bg-occupiedRed' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    noEntryZone ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Rain Mode Pulse Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-blue-100 text-primary">
                  <CloudRain className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-darkNavy block">Rain Mode (Monsoon)</span>
                  <span className="text-[10px] text-slate-500">Boosts laser 500Hz pulse</span>
                </div>
              </div>
              <button
                onClick={() => {
                  setRainMode(!rainMode);
                  addLog(`Monsoon Rain Mode ${!rainMode ? 'ACTIVATED (500Hz)' : 'DEACTIVATED'}.`, 'system', '#2563EB');
                }}
                className={`w-10 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                  rainMode ? 'bg-primary' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    rainMode ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Overflow Setting: Allow Bikes in Car Bays */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-amber-100 text-amber-700">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-darkNavy block">Allow 2W in Car Bays</span>
                  <span className="text-[10px] text-amber-600 font-semibold">Overflow (labels wasted area)</span>
                </div>
              </div>
              <button
                onClick={() => {
                  setAllowBikeInCarBay(!allowBikeInCarBay);
                  addLog(`Overflow 2W-in-Car policy ${!allowBikeInCarBay ? 'ENABLED' : 'DISABLED'}.`, 'info', '#F59E0B');
                }}
                className={`w-10 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                  allowBikeInCarBay ? 'bg-amber-500' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    allowBikeInCarBay ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

          </div>

        </div>

      </div>

      {/* SLOT CLICK ACTION MODAL / POPOVER */}
      <AnimatePresence>
        {selectedSlot && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-sm w-full p-5 border border-slate-200 shadow-2xl relative"
            >
              <button
                onClick={() => setSelectedSlot(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                  occupiedMap[selectedSlot.id]?.occupied ? 'bg-red-50 text-occupiedRed' : 'bg-green-50 text-availableGreen'
                }`}>
                  {selectedSlot.type === 'bike' ? <Bike className="w-5 h-5" /> : <Car className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-darkNavy">
                    Slot {selectedSlot.id} ({selectedSlot.type.toUpperCase()})
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Dimensions: {selectedSlot.width_m}m × {selectedSlot.length_m}m ({selectedSlot.area_m2} m²)
                  </p>
                </div>
              </div>

              {/* If Occupied */}
              {occupiedMap[selectedSlot.id]?.occupied ? (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Plate:</span>
                      <span className="font-bold text-darkNavy">{occupiedMap[selectedSlot.id].vehicleNum}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Type:</span>
                      <span className="capitalize text-darkNavy">{occupiedMap[selectedSlot.id].vehicleType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Parked Since:</span>
                      <span className="text-slate-700">{occupiedMap[selectedSlot.id].entryTime || '10:00 AM'}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-1">
                      <span className="text-slate-500">Bay Efficiency:</span>
                      <span className="font-bold text-emerald-600">
                        {selectedSlot.type === 'bike' ? '51.2% (1.6m² / 3.1m²)' : '61.9% (7.7m² / 12.5m²)'}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => executeVacate(selectedSlot.id)}
                    className="w-full py-2.5 rounded-xl bg-occupiedRed hover:bg-red-600 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
                  >
                    Vacate Bay & Release Vehicle
                  </button>
                </div>
              ) : (
                /* If Available: Allocation Options strictly respecting vehicle sizes */
                <div className="space-y-3">
                  <p className="text-xs text-slate-600">
                    Select an action for this vacant bay:
                  </p>

                  {/* Park Car Button (Only enabled if slot width >= 2.5m) */}
                  <button
                    disabled={selectedSlot.type === 'bike'}
                    onClick={() => executePark(selectedSlot, 'car')}
                    className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-between border transition-all cursor-pointer ${
                      selectedSlot.type !== 'bike'
                        ? 'bg-blue-50 border-primary text-primary hover:bg-blue-100'
                        : 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Car className="w-4 h-4" />
                      <span>Park Car (1.8×4.3m)</span>
                    </div>
                    {selectedSlot.type === 'bike' && (
                      <span className="text-[10px] text-red-500 font-mono">Requires 2.5m Bay</span>
                    )}
                  </button>

                  {/* Park Bike Button */}
                  <button
                    disabled={selectedSlot.type !== 'bike' && !allowBikeInCarBay}
                    onClick={() => executePark(selectedSlot, 'bike')}
                    className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-between border transition-all cursor-pointer ${
                      selectedSlot.type === 'bike'
                        ? 'bg-teal-50 border-teal-500 text-teal-800 hover:bg-teal-100'
                        : allowBikeInCarBay
                        ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                        : 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Bike className="w-4 h-4" />
                      <span>Park Bike (0.8×2.0m)</span>
                    </div>
                    {selectedSlot.type !== 'bike' && !allowBikeInCarBay && (
                      <span className="text-[10px] text-slate-400 font-mono">Overflow disabled</span>
                    )}
                    {selectedSlot.type !== 'bike' && allowBikeInCarBay && (
                      <span className="text-[10px] text-amber-700 font-mono">Wastes 9.4m²</span>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      addLog(`Slot ${selectedSlot.id} marked as Maintenance/Blocked.`, 'alert', '#EF4444');
                      setSelectedSlot(null);
                    }}
                    className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-all cursor-pointer"
                  >
                    Block Bay for Maintenance
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
