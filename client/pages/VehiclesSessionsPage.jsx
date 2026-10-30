import React, { useState, useEffect } from 'react';
import { Car, Bike, Search, Download, Plus, X } from 'lucide-react';
import { api } from '../services/api';
import { wsClient } from '../services/ws';
import { useAuth } from '../hooks/useAuth';

export default function VehiclesSessionsPage() {
  const { canEdit } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // Manual entry modal
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [newVehicleNum, setNewVehicleNum] = useState('');
  const [newVehicleType, setNewVehicleType] = useState('car');
  const [newSlotId, setNewSlotId] = useState('');

  const fetchSessions = (page = 1) => {
    let params = `page=${page}&limit=${pagination.limit}`;
    if (search) params += `&search=${encodeURIComponent(search)}`;
    if (statusFilter) params += `&status=${statusFilter}`;
    if (typeFilter) params += `&type=${typeFilter}`;

    api.getSessions(params)
      .then(data => {
        setSessions(data.sessions || []);
        if (data.pagination) setPagination(data.pagination);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSessions(1);

    const unsubEntry = wsClient.on('vehicle.entered', () => fetchSessions(pagination.page));
    const unsubExit = wsClient.on('vehicle.exited', () => fetchSessions(pagination.page));

    return () => {
      unsubEntry();
      unsubExit();
    };
  }, [search, statusFilter, typeFilter]);

  const handleManualExit = async (slotId, vehicleNumber) => {
    if (!canEdit) return;
    try {
      await api.manualExit({ slotId, vehicleNumber });
      fetchSessions(pagination.page);
    } catch (err) {
      alert(err.message || 'Exit action failed.');
    }
  };

  const handleManualEntrySubmit = async (e) => {
    e.preventDefault();
    if (!newVehicleNum) return;
    try {
      await api.manualEntry({
        vehicleNumber: newVehicleNum,
        vehicleType: newVehicleType,
        slotId: newSlotId || undefined
      });
      setEntryModalOpen(false);
      setNewVehicleNum('');
      setNewSlotId('');
      fetchSessions(1);
    } catch (err) {
      alert(err.message || 'Manual entry failed.');
    }
  };

  const handleExportCsv = () => {
    window.open('/api/sessions?exportCsv=true', '_blank');
  };

  return (
    <div className="space-y-4">
      
      {/* Page Header */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-card-soft flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-darkNavy tracking-tight">
            Vehicles & Parking Sessions
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Registry of active parking sessions, historical dwell durations, automated tolling fees, and manual gate operations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              onClick={() => setEntryModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-blue-700 text-white font-bold text-xs shadow-laser-blue transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Manual Entry</span>
            </button>
          )}

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-200 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-card-soft flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vehicle or slot..."
              className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs w-48 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-darkNavy font-medium"
          >
            <option value="">All Vehicle Types</option>
            <option value="car">Four-Wheelers (Car)</option>
            <option value="bike">Two-Wheelers (2W)</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-darkNavy font-medium"
          >
            <option value="">All Statuses</option>
            <option value="active">Active (Parked)</option>
            <option value="completed">Completed (Departed)</option>
          </select>
        </div>

        <span className="text-xs text-slate-400 font-mono">
          Total: <strong>{pagination.total}</strong> sessions
        </span>
      </div>

      {/* Sessions Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 font-mono text-[10px] uppercase">
              <tr>
                <th className="py-3 px-4">Session ID</th>
                <th className="py-3 px-4">Vehicle Number</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Slot</th>
                <th className="py-3 px-4">Entry Time</th>
                <th className="py-3 px-4">Exit Time</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Fee (INR)</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan="10" className="py-8 text-center text-slate-400 font-medium">
                    No matching sessions found.
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-mono text-slate-400">#{s.id}</td>
                    <td className="py-3 px-4 font-bold text-darkNavy font-mono">{s.vehicle_number}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        s.vehicle_type === 'bike' ? 'bg-cyan-50 text-cyan-700' : 'bg-blue-50 text-primary'
                      }`}>
                        {s.vehicle_type === 'bike' ? <Bike className="w-3 h-3" /> : <Car className="w-3 h-3" />}
                        <span className="capitalize">{s.vehicle_type}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-darkNavy">{s.slot_id}</td>
                    <td className="py-3 px-4 font-mono text-slate-500">{new Date(s.entry_time).toLocaleTimeString()}</td>
                    <td className="py-3 px-4 font-mono text-slate-500">{s.exit_time ? new Date(s.exit_time).toLocaleTimeString() : '—'}</td>
                    <td className="py-3 px-4 font-mono">{s.duration_minutes ? `${s.duration_minutes}m` : 'In Progress'}</td>
                    <td className="py-3 px-4 font-mono font-bold text-emerald-700">₹{s.fee}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase ${
                        s.status === 'active' ? 'bg-emerald-100 text-availableGreen animate-pulse' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {s.status === 'active' && canEdit && (
                        <button
                          onClick={() => handleManualExit(s.slot_id, s.vehicle_number)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-occupiedRed border border-slate-200 text-[11px] font-bold transition-colors cursor-pointer"
                        >
                          Manual Exit
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Page {pagination.page} of {pagination.totalPages || 1}</span>
          <div className="flex items-center gap-1">
            <button
              disabled={pagination.page <= 1}
              onClick={() => fetchSessions(pagination.page - 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            >
              Previous
            </button>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => fetchSessions(pagination.page + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Manual Entry Modal */}
      {entryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xl max-w-md w-full animate-fadeIn">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <h3 className="font-extrabold text-base text-darkNavy">Manual Vehicle Entry</h3>
              <button onClick={() => setEntryModalOpen(false)} className="p-1 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleManualEntrySubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-darkNavy mb-1">Vehicle License Plate Number *</label>
                <input
                  type="text"
                  required
                  value={newVehicleNum}
                  onChange={(e) => setNewVehicleNum(e.target.value)}
                  placeholder="e.g. KA-05-MB-4412"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 uppercase font-mono font-bold focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="block font-bold text-darkNavy mb-1">Vehicle Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewVehicleType('car')}
                    className={`p-2.5 rounded-xl border font-bold flex items-center justify-center gap-2 cursor-pointer ${
                      newVehicleType === 'car' ? 'bg-primary text-white border-primary' : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <Car className="w-4 h-4" />
                    <span>Four-Wheeler</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewVehicleType('bike')}
                    className={`p-2.5 rounded-xl border font-bold flex items-center justify-center gap-2 cursor-pointer ${
                      newVehicleType === 'bike' ? 'bg-primary text-white border-primary' : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <Bike className="w-4 h-4" />
                    <span>Two-Wheeler</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-darkNavy mb-1">Specific Slot ID (Optional, Auto if blank)</label>
                <input
                  type="text"
                  value={newSlotId}
                  onChange={(e) => setNewSlotId(e.target.value.toUpperCase())}
                  placeholder="e.g. A04 or leave empty"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEntryModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-blue-700 text-white font-bold shadow-laser-blue cursor-pointer"
                >
                  Confirm Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
