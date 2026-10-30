import React, { useState, useEffect } from 'react';
import { Sparkles, Play, Calendar } from 'lucide-react';
import { api } from '../services/api';
import { wsClient } from '../services/ws';
import { useAuth } from '../hooks/useAuth';

export default function AdaptiveLayoutPage() {
  const { canEdit } = useAuth();
  const [layoutState, setLayoutState] = useState(null);
  const [selectedMode, setSelectedMode] = useState('2w-peak');
  const [previewData, setPreviewData] = useState(null);
  const [isApplying, setIsApplying] = useState(false);
  const [transitionProgress, setTransitionProgress] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchLayout = () => {
    api.getLayout()
      .then(data => {
        setLayoutState(data);
        if (data.current_mode) setSelectedMode(data.current_mode);
      })
      .catch(err => console.error('Failed to load layout state:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLayout();

    const unsubChange = wsClient.on('layout.changing', (data) => {
      setIsApplying(true);
      setTransitionProgress(0);
      const interval = setInterval(() => {
        setTransitionProgress(p => {
          if (p >= 100) {
            clearInterval(interval);
            setIsApplying(false);
            return 100;
          }
          return p + 10;
        });
      }, 1200);
    });

    const unsubChanged = wsClient.on('layout.changed', () => {
      fetchLayout();
    });

    return () => {
      unsubChange();
      unsubChanged();
    };
  }, []);

  // Fetch preview whenever selectedMode changes
  useEffect(() => {
    if (selectedMode) {
      api.previewLayout(selectedMode)
        .then(res => setPreviewData(res))
        .catch(() => {});
    }
  }, [selectedMode]);

  const handleApplyLayout = async () => {
    if (!canEdit) return;
    try {
      setIsApplying(true);
      setTransitionProgress(10);
      await api.applyLayout(selectedMode, `Operator switched to ${selectedMode}`);
    } catch (err) {
      setIsApplying(false);
      alert(err.message || 'Failed to apply layout.');
    }
  };

  const handleToggleRule = async (ruleKey, currentEnabled) => {
    if (!canEdit) return;
    try {
      await api.updateGuidanceRule({ ruleKey, enabled: !currentEnabled });
      fetchLayout();
    } catch (err) {
      alert(err.message || 'Failed to update rule.');
    }
  };

  if (loading || !layoutState) {
    return <div className="p-12 text-center text-slate-400 font-mono text-xs">Loading Adaptive Layout Engine...</div>;
  }

  const liveBikeRatio = layoutState.live_demand_ratio_bike || 65;
  const liveCarRatio = 100 - liveBikeRatio;

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-primary text-[10px] font-bold uppercase tracking-wider font-mono mb-1">
            <Sparkles className="w-3 h-3 text-availableGreen" />
            OPERATOR RECONFIGURATION TOOL
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-darkNavy tracking-tight">
            Bharat Adaptive Parking Canvas
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Dynamic multimodal slot geometry reconfiguration powered by 30kpps galvanometer laser projection.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold text-slate-400">Current Mode:</span>
          <span className="px-3 py-1 rounded-xl bg-primary text-white font-mono font-extrabold text-xs uppercase shadow-sm">
            {layoutState.current_mode}
          </span>
        </div>
      </div>

      {/* Transition Progress Bar if changing */}
      {isApplying && (
        <div className="bg-slate-900 rounded-2xl p-4 text-white border border-blue-500/40 shadow-laser-blue animate-fadeIn space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 font-bold text-blue-300">
              <Sparkles className="w-4 h-4 text-availableGreen animate-spin" />
              Galvanometer Lasers Re-Steering Geometry (10–20s Transition)...
            </span>
            <span className="font-mono font-bold text-availableGreen">{transitionProgress}%</span>
          </div>
          <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
            <div 
              className="bg-gradient-to-r from-primary to-availableGreen h-full transition-all duration-300 rounded-full"
              style={{ width: `${transitionProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Live Demand Ratio Gauge Card */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-card-soft">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
          <div>
            <h3 className="font-extrabold text-sm text-darkNavy">
              Live Vehicular Influx Demand Ratio
            </h3>
            <span className="text-xs text-slate-400">Computed continuously from active entry queues</span>
          </div>
          <span className="px-2 py-0.5 rounded bg-emerald-50 text-availableGreen border border-emerald-200 text-[11px] font-mono font-bold">
            +{layoutState.capacity_gain_percent}% Effective Capacity
          </span>
        </div>

        {/* Dual Meter */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-blue-600">🚗 Four-Wheelers: {liveCarRatio}%</span>
            <span className="text-cyan-600">🏍️ Two-Wheelers: {liveBikeRatio}%</span>
          </div>

          <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
            <div 
              className="bg-primary h-full transition-all duration-500" 
              style={{ width: `${liveCarRatio}%` }}
              title={`Cars: ${liveCarRatio}%`}
            />
            <div 
              className="bg-cyan-500 h-full transition-all duration-500" 
              style={{ width: `${liveBikeRatio}%` }}
              title={`Two-Wheelers: ${liveBikeRatio}%`}
            />
          </div>
        </div>
      </div>

      {/* Mode Selector & Preview Flow Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left (7 cols): Mode Selection and Preview comparison */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-6 border border-slate-200 shadow-card-soft space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-extrabold text-sm text-darkNavy">
                Spatial Preset Mode
              </h3>
              <span className="text-xs text-slate-400">Choose preset geometry or enable automated AI scaling</span>
            </div>
          </div>

          {/* Preset Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: 'auto', label: '🤖 Auto (AI)', desc: 'Rule-based auto shift' },
              { id: '2w-peak', label: '🏍️ 2W Peak', desc: 'Max bike bays' },
              { id: 'car-peak', label: '🚗 Car Peak', desc: 'Max 4W bays' },
              { id: 'balanced', label: '⚖️ Balanced', desc: 'Hybrid multimodal' },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMode(m.id)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedMode === m.id
                    ? 'border-primary bg-blue-50/80 ring-2 ring-primary/20 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="font-bold text-xs text-darkNavy">{m.label}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{m.desc}</div>
              </button>
            ))}
          </div>

          {/* Preview Details Comparison Table */}
          {previewData && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-darkNavy uppercase font-mono">
                  Before vs After Comparison
                </span>
                <span className="text-xs font-extrabold text-availableGreen">
                  +{previewData.predicted.capacityGainPercent}% Capacity Gain
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center text-xs">
                <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                  <span className="text-[10px] text-slate-400 block font-mono">Current Total</span>
                  <strong className="text-sm text-darkNavy">{previewData.current.total} Bays</strong>
                </div>
                <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                  <span className="text-[10px] text-slate-400 block font-mono">Predicted Total</span>
                  <strong className="text-sm text-primary">{previewData.predicted.total} Bays</strong>
                </div>
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-availableGreen">
                  <span className="text-[10px] text-emerald-800 block font-mono">Capacity Net</span>
                  <strong className="text-sm">+{previewData.predicted.total - previewData.current.total} Extra</strong>
                </div>
              </div>

              <div className="pt-2 text-xs text-slate-600 flex justify-between">
                <span>Predicted 4-Wheelers: <strong>{previewData.predicted.cars}</strong></span>
                <span>Predicted 2-Wheelers: <strong>{previewData.predicted.bikes}</strong></span>
              </div>
            </div>
          )}

          {/* Action Button */}
          {canEdit && (
            <div className="pt-2">
              <button
                disabled={isApplying || selectedMode === layoutState.current_mode}
                onClick={handleApplyLayout}
                className="w-full py-3 px-4 rounded-xl bg-primary hover:bg-blue-700 text-white font-bold text-xs shadow-laser-blue transition-all disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Apply & Transmit {selectedMode.toUpperCase()} Layout to Galvo Projectors</span>
              </button>
            </div>
          )}
        </div>

        {/* Right (5 cols): Guidance Rules & Schedule */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Guidance Rules Toggles */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-card-soft space-y-3">
            <h3 className="font-extrabold text-sm text-darkNavy pb-2 border-b border-slate-100">
              Laser Guidance Overlays
            </h3>

            {layoutState.rules?.map((rule) => (
              <div key={rule.rule_key} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <div className="text-xs font-bold text-darkNavy">{rule.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono">Applied to {rule.zone}</div>
                </div>

                <button
                  disabled={!canEdit}
                  onClick={() => handleToggleRule(rule.rule_key, rule.enabled === 1)}
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

          {/* Automated Schedule */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-card-soft space-y-3">
            <h3 className="font-extrabold text-sm text-darkNavy pb-2 border-b border-slate-100 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-primary" />
              <span>Automated Schedule Rules</span>
            </h3>

            <div className="space-y-2 text-xs">
              {layoutState.schedule?.map((item) => (
                <div key={item.id} className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-darkNavy block">{item.days}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{item.start_time} – {item.end_time}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-blue-100 text-primary font-bold text-[10px] uppercase font-mono">
                    {item.mode}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* Layout Reconfiguration History Table */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-card-soft space-y-3">
        <h3 className="font-extrabold text-sm text-darkNavy">
          Layout Transition Audit History
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-mono text-[10px] uppercase">
                <th className="py-2">Timestamp</th>
                <th className="py-2">From Mode</th>
                <th className="py-2">To Mode</th>
                <th className="py-2">Reason</th>
                <th className="py-2 text-right">Capacity Transition</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {layoutState.history?.map((h) => (
                <tr key={h.id} className="text-slate-700">
                  <td className="py-2.5 font-mono text-[11px] text-slate-500">{new Date(h.timestamp).toLocaleString()}</td>
                  <td className="py-2.5 font-semibold capitalize">{h.from_mode}</td>
                  <td className="py-2.5 font-bold text-primary capitalize">{h.to_mode}</td>
                  <td className="py-2.5">{h.reason}</td>
                  <td className="py-2.5 text-right font-mono font-bold text-availableGreen">
                    {h.capacity_before} → {h.capacity_after} Bays
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
