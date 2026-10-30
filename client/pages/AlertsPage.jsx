import React, { useState, useEffect } from 'react';
import { AlertTriangle, AlertCircle, Info, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';
import { wsClient } from '../services/ws';
import { useAuth } from '../hooks/useAuth';

export default function AlertsPage() {
  const { canEdit } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [severityFilter, setSeverityFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [loading, setLoading] = useState(true);

  const fetchAlerts = () => {
    api.getAlerts()
      .then(data => setAlerts(data.alerts || []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAlerts();

    const unsub = wsClient.on('alert.updated', () => fetchAlerts());
    return () => unsub();
  }, []);

  const handleUpdateStatus = async (id, status) => {
    if (!canEdit) return;
    try {
      await api.updateAlert(id, status);
      fetchAlerts();
    } catch (err) {
      alert(err.message || 'Action failed.');
    }
  };

  const filteredAlerts = alerts.filter(a => {
    const matchSev = severityFilter === 'All' || a.severity === severityFilter.toLowerCase();
    const matchStatus = statusFilter === 'All' || a.status === statusFilter.toLowerCase();
    return matchSev && matchStatus;
  });

  return (
    <div className="space-y-4">
      
      {/* Page Header */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-card-soft flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-darkNavy tracking-tight">
            Control Room Incident & Alert Console
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Fault telemetry, sensor offline events, high-occupancy thresholds, and overstay violations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Severity Filter */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-darkNavy"
          >
            <option value="All">All Severities</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-darkNavy"
          >
            <option value="All">All Statuses</option>
            <option value="active">Active (Unresolved)</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </div>

      {/* Alerts Feed List */}
      <div className="space-y-3">
        {filteredAlerts.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center text-slate-400 font-medium text-xs border border-slate-200">
            No active incidents matching selected filters. All systems normal.
          </div>
        ) : (
          filteredAlerts.map((alert) => {
            const isCrit = alert.severity === 'critical';
            const isWarn = alert.severity === 'warning';

            return (
              <div
                key={alert.id}
                className={`bg-white rounded-2xl p-4 border transition-all flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${
                  alert.status === 'active'
                    ? isCrit ? 'border-red-300 ring-2 ring-red-100 bg-red-50/20' : isWarn ? 'border-amber-300 ring-2 ring-amber-50 bg-amber-50/20' : 'border-slate-200 shadow-card-soft'
                    : 'border-slate-200 opacity-70'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                    isCrit ? 'bg-red-100 text-occupiedRed' : isWarn ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-primary'
                  }`}>
                    {isCrit ? <AlertCircle className="w-4 h-4" /> : isWarn ? <AlertTriangle className="w-4 h-4" /> : <Info className="w-4 h-4" />}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full ${
                        isCrit ? 'bg-red-100 text-red-800' : isWarn ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {alert.severity}
                      </span>
                      <span className="font-mono text-xs font-bold text-darkNavy">{alert.source}</span>
                      <span className="text-slate-400 text-xs">•</span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {new Date(alert.created_at).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-xs text-darkNavy font-medium leading-relaxed">
                      {alert.message}
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  <span className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold uppercase ${
                    alert.status === 'active' ? 'bg-red-100 text-occupiedRed' : alert.status === 'acknowledged' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-availableGreen'
                  }`}>
                    {alert.status}
                  </span>

                  {canEdit && alert.status !== 'resolved' && (
                    <div className="flex items-center gap-1.5">
                      {alert.status === 'active' && (
                        <button
                          onClick={() => handleUpdateStatus(alert.id, 'acknowledged')}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] cursor-pointer"
                        >
                          Acknowledge
                        </button>
                      )}
                      <button
                        onClick={() => handleUpdateStatus(alert.id, 'resolved')}
                        className="px-2.5 py-1 rounded-lg bg-availableGreen hover:bg-emerald-600 text-white font-bold text-[11px] cursor-pointer flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Resolve</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
