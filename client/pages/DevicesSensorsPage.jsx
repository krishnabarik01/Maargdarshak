import React, { useState, useEffect } from 'react';
import { Wrench, Battery, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import { wsClient } from '../services/ws';
import { useAuth } from '../hooks/useAuth';

export default function DevicesSensorsPage() {
  const { canEdit } = useAuth();
  const [devices, setDevices] = useState([]);
  const [statusFilter, setStatusFilter] = useState('All');
  const [loading, setLoading] = useState(true);

  const fetchDevices = () => {
    api.getDevices()
      .then(data => setDevices(data || []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDevices();

    const unsub = wsClient.on('device.status', (updated) => {
      setDevices(prev => prev.map(d => d.id === updated.id ? { ...d, ...updated } : d));
    });

    return () => unsub();
  }, []);

  const handleAction = async (id, action) => {
    if (!canEdit) return;
    try {
      await api.updateDevice(id, { action });
      fetchDevices();
    } catch (err) {
      alert(err.message || 'Device action failed.');
    }
  };

  const filteredDevices = devices.filter(d => {
    if (statusFilter === 'All') return true;
    if (statusFilter === 'Issues') return d.status === 'offline' || d.status === 'faulty';
    return d.status === statusFilter.toLowerCase();
  });

  const onlineCount = devices.filter(d => d.status === 'online').length;
  const offlineCount = devices.filter(d => d.status === 'offline').length;
  const faultCount = devices.filter(d => d.status === 'faulty').length;

  return (
    <div className="space-y-4">
      
      {/* Page Header */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-card-soft flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-darkNavy tracking-tight">
            Devices & Hardware Health
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Real-time status of ultrasonic/IR sensor arrays, ESP32 microcontrollers, and galvanometer driver boards.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl text-xs font-semibold">
            {['All', 'Issues', 'Online'].map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  statusFilter === f ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:text-darkNavy'
                }`}
              >
                {f} {f === 'Issues' && (offlineCount + faultCount > 0) && `(${offlineCount + faultCount})`}
              </button>
            ))}
          </div>

          <button
            onClick={fetchDevices}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            title="Refresh device states"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Summary KPI Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-card-soft">
          <span className="text-[10px] font-bold text-slate-400 block uppercase font-mono">Total Deployed</span>
          <div className="text-2xl font-black text-darkNavy mt-0.5">{devices.length}</div>
          <span className="text-[10px] text-slate-500">Nodes in Grid</span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-card-soft">
          <span className="text-[10px] font-bold text-slate-400 block uppercase font-mono">Online</span>
          <div className="text-2xl font-black text-availableGreen mt-0.5">{onlineCount}</div>
          <span className="text-[10px] text-slate-500">Heartbeat Healthy</span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-card-soft">
          <span className="text-[10px] font-bold text-slate-400 block uppercase font-mono">Offline</span>
          <div className="text-2xl font-black text-amber-500 mt-0.5">{offlineCount}</div>
          <span className="text-[10px] text-slate-500">Signal Lost</span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-card-soft">
          <span className="text-[10px] font-bold text-slate-400 block uppercase font-mono">Faulty</span>
          <div className="text-2xl font-black text-occupiedRed mt-0.5">{faultCount}</div>
          <span className="text-[10px] text-slate-500">Action Required</span>
        </div>
      </div>

      {/* Devices Health Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 font-mono text-[10px] uppercase">
              <tr>
                <th className="py-3 px-4">Device ID</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Zone</th>
                <th className="py-3 px-4">Battery</th>
                <th className="py-3 px-4">Signal (RSSI)</th>
                <th className="py-3 px-4">Firmware</th>
                <th className="py-3 px-4">Last Seen</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Maintenance Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDevices.map((d) => {
                const isFault = d.status === 'faulty';
                const isOffline = d.status === 'offline';

                return (
                  <tr 
                    key={d.id} 
                    className={`transition-colors ${
                      isFault ? 'bg-red-50/60 hover:bg-red-50' : isOffline ? 'bg-amber-50/60 hover:bg-amber-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-bold text-darkNavy">{d.id}</td>
                    <td className="py-3 px-4 capitalize font-semibold text-slate-600">{d.type.replace('_', ' ')}</td>
                    <td className="py-3 px-4">{d.zone}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <Battery className={`w-3.5 h-3.5 ${d.battery < 50 ? 'text-occupiedRed' : 'text-availableGreen'}`} />
                        <span className="font-mono">{d.battery}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500">{d.signal_strength} dBm</td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">{d.firmware_version}</td>
                    <td className="py-3 px-4 font-mono text-slate-500">{new Date(d.last_seen).toLocaleTimeString()}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase font-mono ${
                        isFault 
                          ? 'bg-red-200 text-red-800' 
                          : isOffline 
                          ? 'bg-amber-200 text-amber-800' 
                          : 'bg-emerald-100 text-availableGreen'
                      }`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {canEdit && (isFault || isOffline) ? (
                        <div className="flex items-center justify-end gap-1.5">
                          {isFault && (
                            <button
                              onClick={() => handleAction(d.id, 'acknowledge_fault')}
                              className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-darkNavy font-bold text-[10px] cursor-pointer"
                            >
                              Acknowledge
                            </button>
                          )}
                          <button
                            onClick={() => handleAction(d.id, 'mark_maintained')}
                            className="px-2.5 py-1 rounded bg-availableGreen hover:bg-emerald-600 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer"
                          >
                            <Wrench className="w-3 h-3" />
                            <span>Mark Fixed</span>
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[10px]">Healthy</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
