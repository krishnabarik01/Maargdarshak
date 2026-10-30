import React, { useState, useEffect } from 'react';
import { Sparkles, CloudRain } from 'lucide-react';
import { api } from '../services/api';
import { wsClient } from '../services/ws';
import { useAuth } from '../hooks/useAuth';

export default function LaserControlPage() {
  const { canEdit } = useAuth();
  const [lasers, setLasers] = useState([]);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testActive, setTestActive] = useState(false);

  const fetchLasers = () => {
    Promise.all([api.getLasers(), api.getLayout()])
      .then(([laserList, layoutData]) => {
        setLasers(laserList);
        setRules(layoutData.rules || []);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLasers();

    const unsubLaser = wsClient.on('laser.updated', (updated) => {
      setLasers(prev => prev.map(l => l.id === updated.id ? updated : l));
    });

    const unsubTest = wsClient.on('laser.test_pattern', () => {
      setTestActive(true);
      setTimeout(() => setTestActive(false), 15000);
    });

    return () => {
      unsubLaser();
      unsubTest();
    };
  }, []);

  const handleUpdate = async (id, payload) => {
    if (!canEdit) return;
    try {
      await api.updateLaser(id, payload);
      setLasers(prev => prev.map(l => l.id === id ? { ...l, ...payload } : l));
    } catch (err) {
      alert(err.message || 'Update failed.');
    }
  };

  const handleTriggerTest = async (unitId = null) => {
    if (!canEdit) return;
    try {
      await api.testPattern(unitId);
      setTestActive(true);
      setTimeout(() => setTestActive(false), 15000);
    } catch (err) {
      alert(err.message || 'Failed to trigger test pattern.');
    }
  };

  const handleRuleToggle = async (ruleKey, currentEnabled, zone) => {
    if (!canEdit) return;
    try {
      await api.updateGuidanceRule({ ruleKey, enabled: !currentEnabled, zone });
      setRules(prev => prev.map(r => r.rule_key === ruleKey ? { ...r, enabled: currentEnabled ? 0 : 1 } : r));
    } catch (err) {
      alert(err.message || 'Rule update failed.');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-darkNavy tracking-tight">
            Laser Guidance & Projector Control
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            30kpps dual-axis galvanometer hardware controllers, direct 520nm diode intensity & rain pulse modulation.
          </p>
        </div>

        <button
          disabled={!canEdit || testActive}
          onClick={() => handleTriggerTest()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-blue-700 text-white font-bold text-xs shadow-laser-blue transition-all disabled:opacity-50 cursor-pointer self-start sm:self-auto"
        >
          <Sparkles className="w-4 h-4 text-availableGreen" />
          <span>{testActive ? 'Test Pattern Active (15s)...' : 'Run All Units Test Pattern'}</span>
        </button>
      </div>

      {/* Laser Units Grid (8 Units) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {lasers.map((unit) => {
          const isFault = unit.status === 'fault';
          const isActive = unit.status === 'active';

          return (
            <div
              key={unit.id}
              className={`bg-white rounded-2xl p-5 border transition-all flex flex-col justify-between ${
                isFault 
                  ? 'border-red-300 ring-2 ring-red-100' 
                  : isActive
                  ? 'border-blue-400 shadow-laser-blue'
                  : 'border-slate-200 shadow-card-soft'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-darkNavy font-mono">{unit.id}</span>
                    <span className="text-[10px] text-slate-400 font-medium">{unit.zone}</span>
                  </div>

                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase font-mono ${
                    isFault ? 'bg-red-100 text-red-700' : isActive ? 'bg-blue-100 text-primary animate-pulse' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {unit.status}
                  </span>
                </div>

                {/* Target slot telemetry */}
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs mb-3 flex items-center justify-between">
                  <span className="text-slate-500 text-[11px]">Active Trajectory:</span>
                  <span className="font-bold text-darkNavy font-mono">
                    {unit.target_slot ? `Slot ${unit.target_slot}` : 'Standby / Idle'}
                  </span>
                </div>

                {/* Intensity Slider */}
                <div className="space-y-1 mb-3">
                  <div className="flex items-center justify-between text-[11px] font-medium text-slate-600">
                    <span>Diode Intensity</span>
                    <span className="font-mono font-bold text-darkNavy">{unit.intensity}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    disabled={!canEdit || isFault}
                    value={unit.intensity}
                    onChange={(e) => handleUpdate(unit.id, { intensity: Number(e.target.value) })}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>

                {/* Rain Pulse Mode Toggle */}
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200 mb-3 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <CloudRain className="w-3.5 h-3.5 text-cyan-600" />
                    <span>500Hz Rain Pulse</span>
                  </div>
                  <button
                    disabled={!canEdit || isFault}
                    onClick={() => handleUpdate(unit.id, { pulse_mode: unit.pulse_mode === 1 ? 0 : 1 })}
                    className={`w-8 h-4 flex items-center rounded-full p-0.5 cursor-pointer transition-colors ${
                      unit.pulse_mode === 1 ? 'bg-cyan-500' : 'bg-slate-300'
                    }`}
                  >
                    <div className={`bg-white w-3 h-3 rounded-full shadow transform transition-transform ${
                      unit.pulse_mode === 1 ? 'translate-x-4' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              </div>

              {/* Mode Select & Unit Action */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                <select
                  disabled={!canEdit || isFault}
                  value={unit.mode}
                  onChange={(e) => handleUpdate(unit.id, { mode: e.target.value })}
                  className="px-2 py-1 rounded-lg border border-slate-200 text-xs bg-white text-darkNavy focus:outline-none"
                >
                  <option value="guidance">Guidance Mode</option>
                  <option value="test">Test Pattern</option>
                  <option value="calibration">Calibration</option>
                  <option value="disabled">Disabled</option>
                </select>

                <button
                  disabled={!canEdit || isFault}
                  onClick={() => handleTriggerTest(unit.id)}
                  className="p-1 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-50 text-[10px] font-bold"
                  title="Calibrate this unit"
                >
                  Calibrate
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Guidance Rules Matrix Card */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-card-soft space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div>
            <h3 className="font-extrabold text-sm text-darkNavy">
              Optical Guidance Rules & Zone Restrictions
            </h3>
            <span className="text-xs text-slate-400">Controls which laser projections and symbols are drawn per sector</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rules.map((rule) => (
            <div key={rule.rule_key} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <div className="font-bold text-xs text-darkNavy">{rule.name}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Applied to Sector: <strong>{rule.zone}</strong></div>
              </div>

              <button
                disabled={!canEdit}
                onClick={() => handleRuleToggle(rule.rule_key, rule.enabled === 1, rule.zone)}
                className={`w-9 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors ${
                  rule.enabled === 1 ? 'bg-primary' : 'bg-slate-300'
                }`}
              >
                <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  rule.enabled === 1 ? 'translate-x-4' : 'translate-x-0'
                }`} />
              </button>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
