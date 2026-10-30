import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, MapPin, Layers, Sparkles, Car, Cpu, BarChart3, AlertTriangle, Sliders, Settings, Compass, LogOut, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { wsClient } from '../services/ws';
import { api } from '../services/api';

export const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/lot-map', label: 'Live Lot Map', icon: MapPin },
  { path: '/adaptive-layout', label: 'Adaptive Layout', icon: Layers, badge: 'Hero', badgeColor: 'bg-primary text-white' },
  { path: '/live-demo', label: 'Live Demo', icon: Sparkles, badge: 'Live', badgeColor: 'bg-availableGreen text-white' },
  { path: '/laser-control', label: 'Laser Control', icon: Sliders },
  { path: '/sessions', label: 'Vehicles & Sessions', icon: Car },
  { path: '/devices', label: 'Devices & Sensors', icon: Cpu },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/alerts', label: 'Alerts', icon: AlertTriangle, hasAlertCount: true },
  { path: '/settings', label: 'Settings', icon: Settings },
  { path: '/driver', label: 'Driver Kiosk View', icon: Compass, badge: 'Public', badgeColor: 'bg-slate-800 text-slate-200' },
];

export default function Sidebar({ mobileOpen, setMobileOpen }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unreadAlerts, setUnreadAlerts] = useState(3);

  useEffect(() => {
    // Initial alert count
    api.getAlerts().then(data => {
      if (data?.unreadCount !== undefined) setUnreadAlerts(data.unreadCount);
    }).catch(() => {});

    // Listen to real-time alert events
    const unsub = wsClient.on('alert.updated', (data) => {
      if (data?.unreadCount !== undefined) {
        setUnreadAlerts(data.unreadCount);
      }
    });

    return () => unsub();
  }, []);

  return (
    <>
      {mobileOpen && (
        <div 
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden"
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-[260px] bg-white border-r border-slate-200 flex flex-col justify-between transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo & Platform Name */}
          <div className="h-16 flex items-center justify-between px-5 border-b border-slate-100">
            <NavLink 
              to="/" 
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 group"
            >
              <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white shadow-laser-blue border border-blue-400/40">
                <Compass className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="font-extrabold text-base tracking-tight text-darkNavy group-hover:text-primary transition-colors">
                  Maargdarshak
                </div>
                <div className="text-[10px] font-bold text-slate-400 tracking-wider uppercase font-mono">
                  मार्गदर्शक · CONTROL ROOM
                </div>
              </div>
            </NavLink>

            <button
              onClick={() => setMobileOpen(false)}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
            <div className="px-2.5 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
              OPERATIONS MENU
            </div>

            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all group ${
                      isActive
                        ? 'bg-primary/10 text-primary border border-blue-500/20 shadow-sm'
                        : 'text-slate-600 hover:text-darkNavy hover:bg-slate-50 border border-transparent'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-primary' : 'text-slate-400 group-hover:text-slate-600'}`} />
                        <span>{item.label}</span>
                      </div>

                      {item.hasAlertCount && unreadAlerts > 0 ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-occupiedRed text-white">
                          {unreadAlerts}
                        </span>
                      ) : item.badge ? (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${item.badgeColor}`}>
                          {item.badge}
                        </span>
                      ) : null}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>

          {/* Status & User Card */}
          <div className="p-3 border-t border-slate-100 space-y-2">
            <div className="p-3 rounded-2xl bg-slate-900 text-white border border-slate-800 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-availableGreen animate-ping"></span>
                  <span className="text-xs font-bold text-white">Laser System: Active</span>
                </div>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-500/30 text-blue-300">
                  {user?.role?.toUpperCase() || 'OPERATOR'}
                </span>
              </div>
              <p className="text-[10px] text-slate-300 leading-tight">
                Continuous sensing of slot occupancy and demand ratio.
              </p>
            </div>

            {user && (
              <div className="flex items-center justify-between px-2 pt-1">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 text-primary flex items-center justify-center font-bold text-xs">
                    {user.name?.charAt(0) || 'U'}
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-bold text-darkNavy truncate max-w-[120px]">{user.name}</div>
                    <div className="text-[10px] text-slate-400 capitalize">{user.role}</div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    logout();
                    navigate('/login');
                  }}
                  title="Sign Out"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-occupiedRed hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
