import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Terminal, Layers, ArrowRight, Navigation } from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend 
} from 'recharts';
import { api } from '../services/api';
import { wsClient } from '../services/ws';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [kpis, setKpis] = useState({
    available: 78,
    occupied: 42,
    total: 120,
    cars: 55,
    bikes: 65,
    occupancyPercent: 35,
    activeMode: 'balanced',
    capacityGainPercent: 45,
    vehiclesEnteredToday: 218,
    revenueToday: 7640,
    avgDwellMinutes: 48,
  });

  const [occupancyData, setOccupancyData] = useState([]);
  const [entriesData, setEntriesData] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeGuidance, setActiveGuidance] = useState([]);
  const [guideStats, setGuideStats] = useState({ total: 0, arrived: 0, avgDistance: 0 });

  const fetchGuidance = () => {
    Promise.all([api.getActiveGuidance(), api.getGuidanceStats()])
      .then(([a, st]) => {
        setActiveGuidance(a.active || []);
        setGuideStats(st);
      })
      .catch(() => {});
  };

  const fetchDashboardData = () => {
    Promise.all([
      api.getAnalyticsKpis(),
      api.getOccupancyTrend(),
      api.getEntriesByType(),
      api.getRecentEvents(),
    ])
      .then(([kpiData, occData, entData, evts]) => {
        setKpis(kpiData);
        setOccupancyData(occData);
        setEntriesData(entData);
        setEvents(evts);
      })
      .catch((err) => console.error('Failed to load dashboard:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDashboardData();
    fetchGuidance();

    // Listen to real-time events over WebSocket
    const unsubs = [
      wsClient.on('slot.updated', () => fetchDashboardData()),
      wsClient.on('vehicle.entered', (data) => {
        setEvents(prev => [{
          id: Date.now(),
          event_type: 'entry',
          message: `Vehicle ${data.vehicleNumber} (${data.vehicleType?.toUpperCase()}) docked in Slot ${data.slotId}`,
          created_at: new Date().toISOString()
        }, ...prev.slice(0, 14)]);
      }),
      wsClient.on('vehicle.exited', (data) => {
        setEvents(prev => [{
          id: Date.now(),
          event_type: 'exit',
          message: `Vehicle exited Slot ${data.slotId}. Fee: ₹${data.fee}`,
          created_at: new Date().toISOString()
        }, ...prev.slice(0, 14)]);
      }),
      wsClient.on('layout.changed', () => fetchDashboardData()),
      wsClient.on('guidance.assigned', () => fetchGuidance()),
      wsClient.on('guidance.resolved', () => { fetchGuidance(); }),
    ];

    return () => unsubs.forEach(u => u());
  }, []);

  return (
    <div className="space-y-6">
      
      {/* Top Header Row with Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-darkNavy tracking-tight">
            Control Room Dashboard
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Live lot state, occupancy telemetry, optical galvo status & vehicular influx.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/lot-map')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-blue-700 text-white font-bold text-xs shadow-laser-blue transition-all cursor-pointer"
          >
            <span>Live Lot Map</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => navigate('/adaptive-layout')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold text-xs shadow-sm transition-all cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-primary" />
            <span>Adaptive Tool</span>
          </button>
        </div>
      </div>

      {/* Row of 8 Operational KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        
        {/* 1. Available */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-card-soft">
          <span className="text-[10px] font-bold text-slate-400 block uppercase font-mono">Available</span>
          <div className="text-2xl font-black text-availableGreen mt-0.5">{kpis.available}</div>
          <span className="text-[10px] text-slate-500 font-medium">Slots Open</span>
        </div>

        {/* 2. Occupied */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-card-soft">
          <span className="text-[10px] font-bold text-slate-400 block uppercase font-mono">Occupied</span>
          <div className="text-2xl font-black text-occupiedRed mt-0.5">{kpis.occupied}</div>
          <span className="text-[10px] text-slate-500 font-medium">Active Bays</span>
        </div>

        {/* 3. Occupancy % */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-card-soft">
          <span className="text-[10px] font-bold text-slate-400 block uppercase font-mono">Occupancy %</span>
          <div className="text-2xl font-black text-darkNavy mt-0.5">{kpis.occupancyPercent}%</div>
          <span className="text-[10px] text-slate-500 font-medium">Of {kpis.total} Total</span>
        </div>

        {/* 4. Cars vs 2W */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-card-soft">
          <span className="text-[10px] font-bold text-slate-400 block uppercase font-mono">Cars : 2W</span>
          <div className="text-lg font-black text-darkNavy mt-1">{kpis.cars} : {kpis.bikes}</div>
          <span className="text-[10px] text-slate-500 font-medium">Bays Configured</span>
        </div>

        {/* 5. Active Mode */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-card-soft">
          <span className="text-[10px] font-bold text-slate-400 block uppercase font-mono">Active Mode</span>
          <div className="text-sm font-black text-primary mt-1.5 uppercase truncate">{kpis.activeMode}</div>
          <span className="text-[10px] text-availableGreen font-bold">+{kpis.capacityGainPercent}% Gain</span>
        </div>

        {/* 6. Vehicles Entered Today */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-card-soft">
          <span className="text-[10px] font-bold text-slate-400 block uppercase font-mono">Entries Today</span>
          <div className="text-2xl font-black text-darkNavy mt-0.5">{kpis.vehiclesEnteredToday}</div>
          <span className="text-[10px] text-slate-500 font-medium">Gate Passages</span>
        </div>

        {/* 7. Avg Dwell Time */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-card-soft">
          <span className="text-[10px] font-bold text-slate-400 block uppercase font-mono">Avg Dwell</span>
          <div className="text-2xl font-black text-darkNavy mt-0.5">{kpis.avgDwellMinutes}m</div>
          <span className="text-[10px] text-slate-500 font-medium">Per Session</span>
        </div>

        {/* 8. Revenue Today */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-card-soft">
          <span className="text-[10px] font-bold text-slate-400 block uppercase font-mono">Revenue Today</span>
          <div className="text-xl font-black text-emerald-700 mt-0.5">₹{kpis.revenueToday}</div>
          <span className="text-[10px] text-slate-500 font-medium">Billed Automated</span>
        </div>

      </div>

      {/* Laser guidance: live tickets */}
      <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-card-soft text-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 mb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-availableGreen" />
            <h3 className="font-extrabold text-sm">Laser Guidance — live</h3>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-availableGreen text-[10px] font-mono font-bold">
              {activeGuidance.length} ACTIVE
            </span>
          </div>
          <div className="flex items-center gap-4 text-[11px] font-mono text-slate-400">
            <span><strong className="text-white">{kpis.guidedVehicles ?? guideStats.arrived}</strong> guided arrivals</span>
            <span><strong className="text-white">{kpis.avgSearchTimeSavedMin ?? 0}</strong> min est. search time saved / car</span>
            <span><strong className="text-white">{guideStats.avgDistance}</strong> m avg route</span>
          </div>
        </div>

        {activeGuidance.length === 0 ? (
          <p className="text-xs text-slate-500">No vehicles are being guided right now. Open the gate kiosk or let the simulator run to see tickets appear here.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {activeGuidance.map((g) => (
              <div key={g.ticket} className="rounded-xl bg-slate-950 border border-emerald-500/30 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-black text-xl text-availableGreen">{g.slotId}</span>
                  <span className="text-[10px] font-mono text-slate-400">#{g.ticket}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {g.vehicleType === 'bike' ? '2W' : 'Car'} · {g.zone} · {g.distanceMeters} m
                </div>
                <div className="text-[11px] font-mono mt-1 text-emerald-300">
                  {g.laserId ? `Laser ${g.laserId} pointing` : 'Display-only (no free laser)'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Charts & Live Feed Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column (8 cols): Charts */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Chart 1: Occupancy Over Time (Live) */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-card-soft">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
              <div>
                <h3 className="font-extrabold text-sm text-darkNavy">
                  Occupancy Over Time (Live 24h)
                </h3>
                <span className="text-[11px] text-slate-400">Aggregated real-time sensor occupancy %</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-[11px] font-bold text-primary font-mono">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                  LIVE STREAM
                </span>
              </div>
            </div>

            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={occupancyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="occGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748B' }} unit="%" />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', fontSize: '12px' }}
                    formatter={(val) => [`${val}%`, 'Occupancy']}
                  />
                  <Area type="monotone" dataKey="occupancyPercent" stroke="#2563EB" strokeWidth={2.5} fillOpacity={1} fill="url(#occGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Car vs Two-Wheeler Entries */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-card-soft">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
              <div>
                <h3 className="font-extrabold text-sm text-darkNavy">
                  Vehicular Influx Breakdown (Cars vs Two-Wheelers)
                </h3>
                <span className="text-[11px] text-slate-400">Hourly gate arrival distribution</span>
              </div>
            </div>

            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={entriesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Bar dataKey="bikes" name="Two-Wheelers (2W)" fill="#06B6D4" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cars" name="Four-Wheelers (Car)" fill="#2563EB" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

        {/* Right Column (4 cols): Live Event Feed */}
        <div className="lg:col-span-4 bg-white rounded-2xl p-5 border border-slate-200 shadow-card-soft flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-primary" />
                <h3 className="font-extrabold text-sm text-darkNavy">Live Event Feed</h3>
              </div>
              <span className="text-[10px] font-mono text-slate-400">Real-Time Ingestion</span>
            </div>

            <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
              {events.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs font-medium">
                  Listening for real-time sensor & gate events...
                </div>
              ) : (
                events.map((evt, idx) => (
                  <div
                    key={evt.id || idx}
                    className={`p-2.5 rounded-xl border text-[11px] leading-snug ${
                      evt.event_type === 'entry'
                        ? 'bg-blue-50/70 border-blue-200 text-blue-900'
                        : evt.event_type === 'exit'
                        ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                        : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-0.5">
                      <span className="uppercase font-bold text-darkNavy">{evt.event_type}</span>
                      <span>{evt.created_at ? new Date(evt.created_at).toLocaleTimeString() : 'Just now'}</span>
                    </div>
                    <span>{evt.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 mt-4">
            <button
              onClick={() => navigate('/sessions')}
              className="w-full py-2 text-center text-xs font-bold text-primary hover:bg-blue-50 rounded-xl border border-blue-200 transition-colors cursor-pointer"
            >
              View Full Sessions Registry →
            </button>
          </div>
        </div>

      </div>

    </div>
  );
}
