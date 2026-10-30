import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Bell, Radio, Sparkles } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { wsClient } from '../services/ws';

export default function Topbar({ setMobileOpen }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [unreadAlerts, setUnreadAlerts] = useState(2);
  const [alertsList, setAlertsList] = useState([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [sensors, setSensors] = useState({ online: 0, total: 0 });
  const [facility, setFacility] = useState('North Terminal Lot 01');

  useEffect(() => {
    api.getAlerts().then(data => {
      if (data?.unreadCount !== undefined) setUnreadAlerts(data.unreadCount);
      if (data?.alerts) setAlertsList(data.alerts.slice(0, 4));
    }).catch(() => {});

    const loadSensors = () => api.getDevices().then((devs) => {
      const s = devs.filter((d) => d.type === 'ultrasonic');
      setSensors({ online: s.filter((d) => d.status === 'online').length, total: s.length });
    }).catch(() => {});
    loadSensors();
    const sensorTimer = setInterval(loadSensors, 20000);

    api.getSettings().then((st) => {
      if (st?.lot_name) setFacility(st.lot_name.split('—').pop().trim());
    }).catch(() => {});

    const unsub = wsClient.on('alert.updated', (data) => {
      if (data?.unreadCount !== undefined) setUnreadAlerts(data.unreadCount);
      if (data?.alert) {
        setAlertsList(prev => [data.alert, ...prev.filter((a) => a.id !== data.alert.id)].slice(0, 4));
      }
    });

    return () => { unsub(); clearInterval(sensorTimer); };
  }, []);

  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 flex items-center justify-between shadow-sm">
      
      {/* Left: Mobile hamburger & SYSTEM LIVE indicator */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setMobileOpen(true)}
          className="lg:hidden p-2 rounded-xl text-slate-600 hover:text-darkNavy hover:bg-slate-100"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-700 text-xs font-bold shadow-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-availableGreen opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-availableGreen"></span>
          </span>
          <span className="tracking-wide uppercase font-mono text-[11px]">SYSTEM LIVE</span>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 font-medium pl-2 border-l border-slate-200">
          <span>Facility: <strong className="text-darkNavy">{facility}</strong></span>
        </div>
      </div>

      {/* Right: Status chips, Bell icon, User chip */}
      <div className="flex items-center gap-2 sm:gap-3">
        
        {/* Chip 1: Sensors Online */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700">
          <Radio className="w-3.5 h-3.5 text-availableGreen" />
          <span>Sensors: {sensors.online}/{sensors.total} Online</span>
        </div>

        {/* Chip 2: AI Engine Active */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-xs font-semibold text-primary">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span>AI Engine Active</span>
        </div>

        {/* Notification Bell Dropdown */}
        <div className="relative">
          <button
            onClick={() => setAlertsOpen(!alertsOpen)}
            className="relative p-2 rounded-xl text-slate-600 hover:text-darkNavy hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Alerts"
          >
            <Bell className="w-4 h-4" />
            {unreadAlerts > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-occupiedRed border border-white"></span>
            )}
          </button>

          {alertsOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 z-50">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                <span className="text-xs font-bold text-darkNavy uppercase tracking-wider font-mono">
                  Active Alerts ({unreadAlerts})
                </span>
                <button
                  onClick={() => { setAlertsOpen(false); navigate('/alerts'); }}
                  className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                >
                  View All
                </button>
              </div>

              <div className="space-y-2 text-xs">
                {alertsList.map((a) => (
                  <div 
                    key={a.id} 
                    className={`p-2.5 rounded-xl border ${
                      a.severity === 'critical' ? 'bg-red-50/70 border-red-200 text-red-900' : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                      <span className="font-bold uppercase text-occupiedRed">{a.severity}</span>
                      <span className="text-slate-400">{a.source}</span>
                    </div>
                    <div className="leading-snug text-[11px]">{a.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User Chip */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="w-8 h-8 rounded-xl bg-primary text-white font-bold text-xs flex items-center justify-center shadow-laser-blue">
            {user?.name?.charAt(0) || 'A'}
          </div>
          <div className="hidden lg:block text-left">
            <div className="text-xs font-bold text-darkNavy leading-none">{user?.name || 'Operator'}</div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5 capitalize">{user?.role || 'Staff'}</div>
          </div>
        </div>

      </div>

    </header>
  );
}
