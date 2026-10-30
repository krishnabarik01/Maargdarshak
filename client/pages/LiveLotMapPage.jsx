import React, { useState, useEffect } from 'react';
import { Search, Zap, Accessibility, X } from 'lucide-react';
import { api } from '../services/api';
import { wsClient } from '../services/ws';
import { useAuth } from '../hooks/useAuth';

export default function LiveLotMapPage() {
  const { canEdit } = useAuth();
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedZone, setSelectedZone] = useState('All');
  const [loading, setLoading] = useState(true);
  const [activeLaserPath, setActiveLaserPath] = useState(null);

  const fetchSlots = () => {
    api.getLotState()
      .then(data => {
        setSlots(data.slots || []);
        if (selectedSlot) {
          const fresh = data.slots.find(s => s.id === selectedSlot.id);
          if (fresh) setSelectedSlot(fresh);
        }
      })
      .catch(err => console.error('Failed to load lot map:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSlots();

    const unsubSlot = wsClient.on('slot.updated', (updated) => {
      setSlots(prev => prev.map(s => s.id === updated.id ? updated : s));
      setSelectedSlot(curr => curr && curr.id === updated.id ? updated : curr);

      // If slot became occupied, briefly animate laser path to it
      if (updated.status === 'occupied') {
        const startX = 350;
        const startY = 560;
        const pathD = `M ${startX} ${startY} V 200 H ${updated.x + updated.w / 2} V ${updated.y + updated.h / 2}`;
        setActiveLaserPath({ d: pathD, slotId: updated.id });
        setTimeout(() => setActiveLaserPath(null), 3000);
      }
    });

    const unsubLot = wsClient.on('lot.state', () => fetchSlots());

    return () => {
      unsubSlot();
      unsubLot();
    };
  }, []);

  const handleSlotAction = async (action, payload = {}) => {
    if (!selectedSlot) return;
    try {
      const res = await api.updateSlot(selectedSlot.id, { action, ...payload });
      setSelectedSlot(res.slot);
    } catch (err) {
      alert(err.message || 'Action failed.');
    }
  };

  const filteredSlots = slots.filter(slot => {
    const matchesZone = selectedZone === 'All' || slot.zone === selectedZone;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || 
      slot.id.toLowerCase().includes(q) || 
      (slot.current_vehicle && slot.current_vehicle.toLowerCase().includes(q)) ||
      (slot.sensor_id && slot.sensor_id.toLowerCase().includes(q));
    return matchesZone && matchesSearch;
  });

  const availableCount = filteredSlots.filter(s => s.status === 'available').length;
  const occupiedCount = filteredSlots.filter(s => s.status === 'occupied').length;
  const blockedCount = filteredSlots.filter(s => s.status === 'blocked').length;

  return (
    <div className="space-y-4">
      
      {/* Top Controls Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-card-soft flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-darkNavy tracking-tight">
            Live Lot Map
          </h1>
          <div className="flex items-center gap-3 text-xs text-slate-500 font-medium mt-0.5">
            <span>Showing <strong className="text-darkNavy">{filteredSlots.length}</strong> slots</span>
            <span>•</span>
            <span className="text-availableGreen font-bold">{availableCount} Free</span>
            <span>•</span>
            <span className="text-occupiedRed font-bold">{occupiedCount} Occupied</span>
            {blockedCount > 0 && (
              <>
                <span>•</span>
                <span className="text-slate-600 font-bold">{blockedCount} Blocked</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Zone Selector */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl text-xs font-semibold">
            {['All', 'Zone A', 'Zone B', 'Zone C'].map(z => (
              <button
                key={z}
                onClick={() => setSelectedZone(z)}
                className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                  selectedZone === z ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:text-darkNavy'
                }`}
              >
                {z === 'All' ? 'All Zones' : z}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search slot ID or vehicle..."
              className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs w-56 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>
        </div>
      </div>

      {/* SVG Canvas Map Stage */}
      <div className="relative w-full aspect-[16/10] sm:aspect-[16/9] bg-[#070B14] rounded-3xl border border-slate-800 shadow-2xl overflow-hidden p-3 flex items-center justify-center">
        
        <div className="absolute inset-0 bg-dark-grid-pattern opacity-30"></div>
        <div className="scanline-effect"></div>

        <svg
          className="w-full h-full"
          viewBox="0 0 720 540"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Outer Perimeter */}
          <rect x="20" y="20" width="680" height="500" rx="16" fill="#0A0F1D" stroke="#1E293B" strokeWidth="2" />

          {/* Driveway lanes */}
          <path d="M 30 170 H 690" stroke="#334155" strokeWidth="2" strokeDasharray="8 6" />
          <path d="M 30 360 H 690" stroke="#334155" strokeWidth="2" strokeDasharray="8 6" />
          <path d="M 360 520 V 170" stroke="#334155" strokeWidth="2" strokeDasharray="8 6" />

          {/* Gates */}
          <g id="gates">
            <rect x="310" y="500" width="100" height="20" rx="4" fill="#1E3A8A" stroke="#2563EB" strokeWidth="2" />
            <text x="360" y="514" textAnchor="middle" fill="#93C5FD" fontSize="9" fontWeight="bold">ENTRY GATE 01</text>

            <rect x="30" y="25" width="80" height="15" rx="3" fill="#1E293B" stroke="#64748B" strokeWidth="1.5" />
            <text x="70" y="36" textAnchor="middle" fill="#94A3B8" fontSize="8" fontWeight="bold">EXIT NORTH</text>
          </g>

          {/* Overhead Galvo Projectors (8 units) */}
          {[120, 280, 440, 600].map((gx, idx) => (
            <g key={idx} id={`galvo-row1-${idx}`}>
              <circle cx={gx} cy="35" r="8" fill="#0F172A" stroke="#2563EB" strokeWidth="1.5" />
              <circle cx={gx} cy="35" r="3" fill="#22C55E" className="animate-pulse" />
              <text x={gx} y="22" textAnchor="middle" fill="#60A5FA" fontSize="7" fontWeight="bold">LZ-0{idx + 1}</text>
            </g>
          ))}
          {[120, 280, 440, 600].map((gx, idx) => (
            <g key={idx} id={`galvo-row2-${idx}`}>
              <circle cx={gx} cy="380" r="8" fill="#0F172A" stroke="#2563EB" strokeWidth="1.5" />
              <circle cx={gx} cy="380" r="3" fill="#22C55E" className="animate-pulse" />
              <text x={gx} y="398" textAnchor="middle" fill="#60A5FA" fontSize="7" fontWeight="bold">LZ-0{idx + 5}</text>
            </g>
          ))}

          {/* Active Guidance Laser Trajectory */}
          {activeLaserPath && (
            <path
              d={activeLaserPath.d}
              fill="none"
              stroke="#22C55E"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray="8 6"
              className="animate-dash-flow"
              filter="drop-shadow(0 0 10px #22C55E)"
            />
          )}

          {/* Slots Rendering */}
          {filteredSlots.map((slot) => {
            const isOccupied = slot.status === 'occupied';
            const isBlocked = slot.status === 'blocked';
            const isSelected = selectedSlot?.id === slot.id;
            const strokeColor = isBlocked ? '#64748B' : isOccupied ? '#EF4444' : '#22C55E';
            const fillColor = isBlocked ? '#1E293B' : isOccupied ? '#1F1722' : '#042F24';

            return (
              <g
                key={slot.id}
                onClick={() => setSelectedSlot(slot)}
                className="cursor-pointer group"
              >
                <rect
                  x={slot.x}
                  y={slot.y}
                  width={slot.w}
                  height={slot.h}
                  rx="4"
                  fill={fillColor}
                  fillOpacity={isOccupied || isBlocked ? 0.7 : 0.4}
                  stroke={strokeColor}
                  strokeWidth={isSelected ? 3 : 1.5}
                  strokeDasharray={slot.type === 'bike' ? '4 2' : ''}
                  className={isSelected ? 'animate-pulse' : ''}
                />

                <text
                  x={slot.x + slot.w / 2}
                  y={slot.y + 12}
                  textAnchor="middle"
                  fill={isBlocked ? '#94A3B8' : isOccupied ? '#EF4444' : '#22C55E'}
                  fontSize={slot.type === 'bike' ? 7 : 9}
                  fontWeight="bold"
                >
                  {slot.id}
                </text>

                {/* EV Glyph */}
                {slot.is_ev === 1 && (
                  <circle cx={slot.x + slot.w / 2} cy={slot.y + slot.h - 8} r="3" fill="#06B6D4" />
                )}

                {/* Occupied Vehicle Symbol */}
                {isOccupied && (
                  <rect
                    x={slot.x + 4}
                    y={slot.y + 16}
                    width={slot.w - 8}
                    height={slot.h - 22}
                    rx="2"
                    fill={slot.type === 'bike' ? '#0E7490' : '#1E3A8A'}
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* Legend Overlay at bottom */}
        <div className="absolute bottom-2 left-4 right-4 flex items-center justify-between text-[11px] bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800 text-slate-300 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-availableGreen"></span> Available
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-occupiedRed"></span> Occupied
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-slate-600"></span> Blocked
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span> EV Bay
            </span>
          </div>

          <span className="text-[10px] font-mono text-blue-400">
            Click slot for telemetry & controls
          </span>
        </div>
      </div>

      {/* Selected Slot Inspector Panel / Modal */}
      {selectedSlot && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-card-soft animate-fadeIn">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl text-white font-black text-sm ${
                selectedSlot.status === 'occupied' ? 'bg-occupiedRed' : selectedSlot.status === 'blocked' ? 'bg-slate-700' : 'bg-availableGreen'
              }`}>
                {selectedSlot.id}
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-darkNavy">
                  Slot Details: {selectedSlot.id} ({selectedSlot.zone})
                </h3>
                <span className="text-xs text-slate-400 font-mono">
                  Sensor ID: {selectedSlot.sensor_id}
                </span>
              </div>
            </div>

            <button
              onClick={() => setSelectedSlot(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-darkNavy hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-4">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-mono">Type</span>
              <strong className="text-darkNavy capitalize">{selectedSlot.type} Bay</strong>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-mono">Status</span>
              <strong className={
                selectedSlot.status === 'occupied' ? 'text-occupiedRed' : selectedSlot.status === 'blocked' ? 'text-slate-600' : 'text-availableGreen'
              }>
                {selectedSlot.status.toUpperCase()}
              </strong>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-mono">Vehicle</span>
              <strong className="text-darkNavy font-mono">{selectedSlot.current_vehicle || 'None (Vacant)'}</strong>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-mono">Occupied Since</span>
              <strong className="text-darkNavy">
                {selectedSlot.occupied_since ? new Date(selectedSlot.occupied_since).toLocaleTimeString() : 'N/A'}
              </strong>
            </div>
          </div>

          {/* Action Buttons (Operator/Admin) */}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
              {selectedSlot.status === 'occupied' ? (
                <button
                  onClick={() => handleSlotAction('force_free')}
                  className="px-3.5 py-2 rounded-xl bg-occupiedRed hover:bg-red-700 text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
                >
                  Force Free Slot
                </button>
              ) : selectedSlot.status === 'blocked' ? (
                <button
                  onClick={() => handleSlotAction('unblock')}
                  className="px-3.5 py-2 rounded-xl bg-availableGreen hover:bg-emerald-600 text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
                >
                  Unblock Slot
                </button>
              ) : (
                <button
                  onClick={() => handleSlotAction('block')}
                  className="px-3.5 py-2 rounded-xl bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
                >
                  Block Slot
                </button>
              )}

              <button
                onClick={() => handleSlotAction('update_ev', { is_ev: !selectedSlot.is_ev })}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-200 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5 text-cyan-600" />
                <span>{selectedSlot.is_ev ? 'Remove EV Tag' : 'Mark EV Ready'}</span>
              </button>

              <button
                onClick={() => handleSlotAction('update_acc', { is_accessible: !selectedSlot.is_accessible })}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-200 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Accessibility className="w-3.5 h-3.5 text-purple-600" />
                <span>{selectedSlot.is_accessible ? 'Remove Accessible' : 'Mark Accessible (♿)'}</span>
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
