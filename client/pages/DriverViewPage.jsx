import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Car,
  Bike,
  Search,
  Compass,
  Navigation,
  Sparkles,
  CheckCircle2,
  Zap,
  Accessibility,
  Timer,
  X,
  AlertCircle,
} from 'lucide-react';
import { api } from '../services/api';
import { wsClient } from '../services/ws';

const STATUS_FILL = {
  available: '#0F3D2E',
  occupied: '#3B1219',
  blocked: '#1E293B',
};

function RouteMap({ slots, guidance, gate }) {
  const bounds = useMemo(() => {
    const maxX = Math.max(720, ...slots.map((s) => s.x + s.w + 20));
    const maxY = Math.max(620, ...slots.map((s) => s.y + s.h + 20));
    return { w: maxX, h: maxY };
  }, [slots]);

  const points = guidance?.path?.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <svg className="w-full h-full" viewBox={`0 0 ${bounds.w} ${bounds.h}`} role="img" aria-label="Route from entry gate to your assigned bay">
      <rect x="2" y="2" width={bounds.w - 4} height={bounds.h - 4} rx="14" fill="#070B14" stroke="#1E293B" strokeWidth="2" />
      {slots.map((s) => {
        const target = guidance?.slotId === s.id;
        return (
          <rect
            key={s.id}
            x={s.x}
            y={s.y}
            width={s.w}
            height={s.h}
            rx="4"
            fill={target ? '#065F46' : STATUS_FILL[s.status] || STATUS_FILL.blocked}
            stroke={target ? '#22C55E' : s.status === 'available' ? '#166534' : '#334155'}
            strokeWidth={target ? 4 : 1.5}
          />
        );
      })}
      <g>
        <rect x={gate.x - 16} y={gate.y - 14} width="62" height="26" rx="6" fill="#1E3A8A" stroke="#2563EB" strokeWidth="2" />
        <text x={gate.x + 15} y={gate.y + 4} textAnchor="middle" fill="#BFDBFE" fontSize="13" fontWeight="700">GATE</text>
      </g>
      {points && (
        <>
          <polyline points={points} fill="none" stroke="#22C55E" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="14 10" className="animate-dash-flow" style={{ filter: 'drop-shadow(0 0 8px #22C55E)' }} />
          {guidance && (
            <circle cx={guidance.path[guidance.path.length - 1].x} cy={guidance.path[guidance.path.length - 1].y} r="9" fill="#22C55E">
              <animate attributeName="r" values="7;14;7" dur="1.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;0.35;1" dur="1.4s" repeatCount="indefinite" />
            </circle>
          )}
        </>
      )}
    </svg>
  );
}

export default function DriverViewPage() {
  const [slots, setSlots] = useState([]);
  const [summary, setSummary] = useState({ carsAvailable: 0, bikesAvailable: 0 });
  const [gate, setGate] = useState({ x: 20, y: 20 });
  const [loading, setLoading] = useState(true);

  const [vehicleType, setVehicleType] = useState('car');
  const [needsEv, setNeedsEv] = useState(false);
  const [needsAccessible, setNeedsAccessible] = useState(false);
  const [plate, setPlate] = useState('');

  const [guidance, setGuidance] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState(null); // { kind: 'arrived' | 'expired' | 'cancelled', slotId }

  const [searchPlate, setSearchPlate] = useState('');
  const [foundVehicle, setFoundVehicle] = useState(null);
  const [searchError, setSearchError] = useState('');

  const ticketRef = useRef(null);
  useEffect(() => {
    ticketRef.current = guidance?.ticket || null;
  }, [guidance]);

  const fetchLot = useCallback(() => {
    api.getLotState()
      .then((data) => {
        const list = data.slots || [];
        setSlots(list);
        const free = (t) => list.filter((s) => s.type === t && s.status === 'available' && !s.reserved).length;
        setSummary({ carsAvailable: free('car'), bikesAvailable: free('bike') });
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchLot();
    api.getActiveGuidance().then((d) => d.gate && setGate(d.gate)).catch(() => {});

    let timer = null;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(fetchLot, 250); // coalesce bursts of events
    };

    const unsubs = [
      wsClient.on('slot.updated', refresh),
      wsClient.on('lot.state', refresh),
      wsClient.on('guidance.assigned', refresh),
      wsClient.on('guidance.resolved', (data) => {
        refresh();
        if (data.ticket === ticketRef.current) {
          setOutcome({ kind: data.outcome, slotId: data.slotId });
          setGuidance(null);
        }
      }),
    ];
    return () => {
      clearTimeout(timer);
      unsubs.forEach((u) => u());
    };
  }, [fetchLot]);

  // Countdown while a bay is being held for this driver.
  useEffect(() => {
    if (!guidance) return undefined;
    const tick = () => setSecondsLeft(Math.max(0, Math.round((new Date(guidance.expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [guidance]);

  const handleGuide = async () => {
    setError('');
    setOutcome(null);
    setRequesting(true);
    try {
      const data = await api.requestGuidance({
        vehicleType,
        vehicleNumber: plate.trim() || undefined,
        needsEv,
        needsAccessible,
      });
      if (data.gate) setGate(data.gate);
      setGuidance(data.guidance);
    } catch (err) {
      setError(err.message || 'Could not find a bay.');
    } finally {
      setRequesting(false);
    }
  };

  const handleCancel = async () => {
    if (!guidance) return;
    try {
      await api.cancelGuidance(guidance.ticket);
    } catch {
      /* already finished */
    }
    setGuidance(null);
  };

  const handleSearchVehicle = (e) => {
    e.preventDefault();
    setSearchError('');
    setFoundVehicle(null);
    const q = searchPlate.toUpperCase().trim();
    if (!q) return;

    api.getSlots(`search=${encodeURIComponent(q)}`)
      .then((results) => {
        const norm = (v) => (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const match = results.find((s) => s.current_vehicle && norm(s.current_vehicle) === norm(q));
        if (match) setFoundVehicle(match);
        else setSearchError(`No parked vehicle found for '${q}'.`);
      })
      .catch(() => setSearchError('Vehicle lookup failed.'));
  };

  const mmss = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;
  const full = (vehicleType === 'car' ? summary.carsAvailable : summary.bikesAvailable) === 0;

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans antialiased pb-12">
      <header className="h-16 border-b border-slate-800 px-4 sm:px-6 flex items-center justify-between bg-slate-900/90 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white shadow-laser-blue">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-extrabold text-sm sm:text-base tracking-tight text-white leading-none">
              Maargdarshak <span className="text-slate-400 font-semibold">· मार्गदर्शक</span>
            </h1>
            <span className="text-[10px] font-mono text-availableGreen font-bold tracking-wider uppercase">Gate terminal kiosk</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-availableGreen text-xs font-mono font-bold">
          <span className="w-2 h-2 rounded-full bg-availableGreen animate-ping"></span>
          <span>LASERS ACTIVE</span>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 pt-6 space-y-6">
        {/* Vehicle type + live availability */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => { setVehicleType('car'); setOutcome(null); }}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
              vehicleType === 'car' ? 'bg-blue-950/90 border-primary ring-2 ring-blue-500/40 shadow-laser-blue' : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <Car className={`w-5 h-5 ${vehicleType === 'car' ? 'text-primary' : 'text-slate-400'}`} />
              <span className="text-[10px] font-mono font-bold uppercase">Car bays</span>
            </div>
            <div className="text-3xl font-black text-white">{loading ? '–' : summary.carsAvailable}</div>
            <span className="text-xs text-availableGreen font-semibold">Available now</span>
          </button>

          <button
            onClick={() => { setVehicleType('bike'); setOutcome(null); }}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
              vehicleType === 'bike' ? 'bg-cyan-950/90 border-cyan-500 ring-2 ring-cyan-500/40 shadow-laser-cyan' : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <Bike className={`w-5 h-5 ${vehicleType === 'bike' ? 'text-cyan-400' : 'text-slate-400'}`} />
              <span className="text-[10px] font-mono font-bold uppercase">2W bays</span>
            </div>
            <div className="text-3xl font-black text-white">{loading ? '–' : summary.bikesAvailable}</div>
            <span className="text-xs text-availableGreen font-semibold">Adaptive ready</span>
          </button>
        </div>

        {/* Request form */}
        {!guidance && (
          <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center gap-2">
              <Navigation className="w-4 h-4 text-availableGreen" />
              <h2 className="font-extrabold text-sm text-white">Guide me to a free bay</h2>
            </div>

            <input
              type="text"
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              maxLength={20}
              placeholder="Number plate (optional) e.g. CG-04-AB-1234"
              aria-label="Number plate (optional)"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-xs font-mono font-bold uppercase focus:outline-none focus:border-primary"
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setNeedsEv((v) => !v)}
                aria-pressed={needsEv}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer ${needsEv ? 'bg-emerald-950 border-emerald-500 text-emerald-300' : 'bg-slate-950 border-slate-700 text-slate-400'}`}
              >
                <Zap className="w-3.5 h-3.5" /> EV charging
              </button>
              <button
                type="button"
                onClick={() => setNeedsAccessible((v) => !v)}
                aria-pressed={needsAccessible}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer ${needsAccessible ? 'bg-blue-950 border-blue-500 text-blue-300' : 'bg-slate-950 border-slate-700 text-slate-400'}`}
              >
                <Accessibility className="w-3.5 h-3.5" /> Accessible bay
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-xs text-red-300 flex items-center gap-2" role="alert">
                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}

            {outcome?.kind === 'arrived' && (
              <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-xs text-emerald-300 flex items-center gap-2" role="status">
                <CheckCircle2 className="w-4 h-4 shrink-0" /> Parked at {outcome.slotId}. Have a great day!
              </div>
            )}
            {outcome?.kind === 'expired' && (
              <div className="p-3 rounded-xl bg-amber-950/60 border border-amber-500/40 text-xs text-amber-300" role="status">
                Your bay ({outcome.slotId}) was released because it was not reached in time. Request guidance again.
              </div>
            )}

            <button
              onClick={handleGuide}
              disabled={requesting || full}
              className="w-full py-3 rounded-2xl bg-availableGreen hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-extrabold text-sm shadow-laser-green cursor-pointer transition-all"
            >
              {requesting ? 'Finding best bay…' : full ? `No ${vehicleType === 'car' ? 'car' : '2W'} bays free` : 'Guide me with laser'}
            </button>
          </div>
        )}

        {/* Active guidance */}
        {guidance && (
          <div className="bg-slate-900 rounded-3xl p-6 border border-emerald-500/30 shadow-2xl space-y-4" role="status" aria-live="polite">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Navigation className="w-5 h-5 text-availableGreen animate-pulse" />
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">Your assigned bay</span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-xs font-mono border border-blue-500/30">{guidance.zone}</span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="text-xs text-slate-400 block">
                  {guidance.laserId ? 'Follow the green laser to:' : 'Follow the on-screen route to:'}
                </span>
                <div className="text-5xl font-black text-availableGreen tracking-tight mt-0.5 font-mono">{guidance.slotId}</div>
                <span className="text-xs text-slate-400">{guidance.distanceMeters} m from the gate</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-center min-w-[104px]">
                <Sparkles className="w-6 h-6 text-availableGreen mx-auto mb-1 animate-pulse" />
                <span className="text-[10px] font-mono text-emerald-300 font-bold block">{guidance.laserId || 'Display only'}</span>
                <span className="text-[10px] text-slate-400">{guidance.laserId ? 'Laser unit' : 'No laser free'}</span>
              </div>
            </div>

            <div className="relative w-full aspect-[7/6] bg-[#070B14] rounded-2xl border border-slate-800 p-1.5 overflow-hidden">
              <RouteMap slots={slots} guidance={guidance} gate={gate} />
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-slate-300 font-mono">
                <Timer className="w-3.5 h-3.5 text-amber-400" /> Held for {mmss}
              </span>
              <span className="font-mono text-slate-500">Ticket {guidance.ticket}</span>
            </div>

            <button
              onClick={handleCancel}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-bold cursor-pointer"
            >
              <X className="w-3.5 h-3.5" /> Cancel guidance
            </button>
          </div>
        )}

        {/* Find my vehicle */}
        <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-xl space-y-3">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-primary" />
            <h3 className="font-extrabold text-sm text-white">Find my parked vehicle</h3>
          </div>
          <p className="text-xs text-slate-400">Enter your number plate to see where you parked and since when.</p>

          <form onSubmit={handleSearchVehicle} className="flex gap-2">
            <input
              type="text"
              required
              value={searchPlate}
              onChange={(e) => setSearchPlate(e.target.value)}
              placeholder="e.g. KA-01-AB-1234"
              aria-label="Number plate"
              className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-xs font-mono font-bold uppercase focus:outline-none focus:border-primary"
            />
            <button type="submit" className="px-4 py-2.5 rounded-xl bg-primary hover:bg-blue-700 font-bold text-xs text-white shadow-laser-blue cursor-pointer">
              Locate
            </button>
          </form>

          {searchError && <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-xs text-red-300">{searchError}</div>}

          {foundVehicle && (
            <div className="p-4 rounded-2xl bg-slate-950 border border-emerald-500/40 space-y-2 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white font-mono">{foundVehicle.current_vehicle}</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-availableGreen font-mono font-bold text-[10px]">Parked in {foundVehicle.zone}</span>
              </div>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800">
                <span className="text-slate-400">Your bay:</span>
                <strong className="text-availableGreen text-base font-mono font-extrabold">Slot {foundVehicle.id}</strong>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Parked since:</span>
                <span className="font-mono text-slate-300">{foundVehicle.occupied_since ? new Date(foundVehicle.occupied_since).toLocaleTimeString() : 'N/A'}</span>
              </div>
            </div>
          )}
        </div>

        <div className="text-center pt-2">
          <a href="/" className="text-xs font-semibold text-slate-500 hover:text-white transition-colors">← Switch to operator control room</a>
        </div>
      </main>
    </div>
  );
}
