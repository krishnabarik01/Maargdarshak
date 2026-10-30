import React, { useState, useEffect } from 'react';
import { Users, Trash2, CheckCircle2, Save } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth';

export default function SettingsPage() {
  const { user, isAdmin } = useAuth();
  const [settings, setSettings] = useState({
    lot_name: '',
    car_rate_hourly: '40',
    bike_rate_hourly: '15',
    free_minutes: '15',
    simulator_enabled: 'true',
    simulator_interval_sec: '4',
    api_key: 'maargdarshak-sensor-key-2026'
  });

  const [usersList, setUsersList] = useState([]);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('operator');

  const [newSlotId, setNewSlotId] = useState('');
  const [newSlotZone, setNewSlotZone] = useState('Zone A');
  const [newSlotType, setNewSlotType] = useState('car');
  const [newSlotIsEv, setNewSlotIsEv] = useState(false);

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchSettingsAndUsers = () => {
    api.getSettings()
      .then(s => setSettings(s))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));

    if (isAdmin) {
      api.getUsers()
        .then(u => setUsersList(u))
        .catch(err => console.error(err));
    }
  };

  useEffect(() => {
    fetchSettingsAndUsers();
  }, [isAdmin]);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    try {
      await api.updateSettings(settings);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      alert(err.message || 'Failed to save settings.');
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUserName || !newUserEmail || !newUserPassword) return;
    try {
      await api.createUser({
        name: newUserName,
        email: newUserEmail,
        password: newUserPassword,
        role: newUserRole
      });
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      fetchSettingsAndUsers();
    } catch (err) {
      alert(err.message || 'Failed to create user.');
    }
  };

  const handleDeleteUser = async (id) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      await api.deleteUser(id);
      fetchSettingsAndUsers();
    } catch (err) {
      alert(err.message || 'Failed to delete user.');
    }
  };

  const handleCreateSlot = async (e) => {
    e.preventDefault();
    if (!newSlotId) return;
    try {
      await api.createSlot({
        id: newSlotId.toUpperCase(),
        zone: newSlotZone,
        type: newSlotType,
        is_ev: newSlotIsEv,
        x: 80,
        y: 80,
        w: newSlotType === 'bike' ? 28 : 40,
        h: newSlotType === 'bike' ? 45 : 65
      });
      alert(`Slot ${newSlotId} created successfully!`);
      setNewSlotId('');
    } catch (err) {
      alert(err.message || 'Failed to create slot.');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-card-soft flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-darkNavy tracking-tight">
            Control Room Settings & Configuration
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Pricing schedules, simulator toggle, hardware API keys, and role-based user management.
          </p>
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-availableGreen text-xs font-bold animate-fadeIn">
            <CheckCircle2 className="w-4 h-4" />
            <span>Settings Saved</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column (7 cols): Pricing, Simulator, API Keys */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Form: Lot Details & Pricing */}
          <form onSubmit={handleSaveSettings} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-card-soft space-y-4">
            <h3 className="font-extrabold text-sm text-darkNavy pb-2 border-b border-slate-100 flex items-center justify-between">
              <span>Lot Profile & Automated Pricing</span>
              {!isAdmin && <span className="text-[10px] text-slate-400 font-mono font-normal">Read-Only (Admin required)</span>}
            </h3>

            <div>
              <label className="block text-xs font-bold text-darkNavy mb-1">Facility Name</label>
              <input
                type="text"
                disabled={!isAdmin}
                value={settings.lot_name || ''}
                onChange={(e) => setSettings({ ...settings, lot_name: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-slate-50"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-darkNavy mb-1">Car Rate (₹/Hour)</label>
                <input
                  type="number"
                  disabled={!isAdmin}
                  value={settings.car_rate_hourly || ''}
                  onChange={(e) => setSettings({ ...settings, car_rate_hourly: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono font-bold focus:outline-none disabled:bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-darkNavy mb-1">2W Rate (₹/Hour)</label>
                <input
                  type="number"
                  disabled={!isAdmin}
                  value={settings.bike_rate_hourly || ''}
                  onChange={(e) => setSettings({ ...settings, bike_rate_hourly: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono font-bold focus:outline-none disabled:bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-darkNavy mb-1">Free Grace Mins</label>
                <input
                  type="number"
                  disabled={!isAdmin}
                  value={settings.free_minutes || ''}
                  onChange={(e) => setSettings({ ...settings, free_minutes: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono font-bold focus:outline-none disabled:bg-slate-50"
                />
              </div>
            </div>

            {/* Influx Simulator Config */}
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-xs text-darkNavy">Background Influx Simulator</h4>
                  <p className="text-[11px] text-slate-400">Generates autonomous vehicle arrivals and sensor pings</p>
                </div>
                
                <button
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => setSettings({ ...settings, simulator_enabled: settings.simulator_enabled === 'true' ? 'false' : 'true' })}
                  className={`w-9 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors ${
                    settings.simulator_enabled === 'true' ? 'bg-primary' : 'bg-slate-300'
                  }`}
                >
                  <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    settings.simulator_enabled === 'true' ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Simulation Ping Interval (Seconds)</label>
                <input
                  type="number"
                  min="2"
                  max="30"
                  disabled={!isAdmin}
                  value={settings.simulator_interval_sec || '4'}
                  onChange={(e) => setSettings({ ...settings, simulator_interval_sec: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-mono disabled:bg-slate-50"
                />
              </div>
            </div>

            {/* Hardware Sensor API Key */}
            <div className="pt-3 border-t border-slate-100">
              <label className="block text-xs font-bold text-darkNavy mb-1">Hardware Sensor API Key (X-API-Key Header)</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={settings.api_key || ''}
                  onChange={(e) => setSettings({ ...settings, api_key: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono bg-slate-50"
                />
              </div>
            </div>

            {isAdmin && (
              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-primary hover:bg-blue-700 text-white font-bold text-xs shadow-laser-blue flex items-center gap-2 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Configuration Changes</span>
                </button>
              </div>
            )}
          </form>

          {/* Slot Editor Card */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-card-soft space-y-4">
            <h3 className="font-extrabold text-sm text-darkNavy pb-2 border-b border-slate-100">
              Slot Provisioning Editor
            </h3>

            <form onSubmit={handleCreateSlot} className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs items-end">
              <div>
                <label className="block font-bold text-darkNavy mb-1">Slot ID *</label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  required
                  placeholder="e.g. C31"
                  value={newSlotId}
                  onChange={(e) => setNewSlotId(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-darkNavy mb-1">Zone</label>
                <select
                  disabled={!isAdmin}
                  value={newSlotZone}
                  onChange={(e) => setNewSlotZone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  <option value="Zone A">Zone A</option>
                  <option value="Zone B">Zone B</option>
                  <option value="Zone C">Zone C</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-darkNavy mb-1">Vehicle Type</label>
                <select
                  disabled={!isAdmin}
                  value={newSlotType}
                  onChange={(e) => setNewSlotType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  <option value="car">Car Bay</option>
                  <option value="bike">Bike Bay</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={!isAdmin}
                className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs disabled:opacity-40 cursor-pointer"
              >
                + Add Slot
              </button>
            </form>
          </div>

        </div>

        {/* Right Column (5 cols): User Management (Admin Only) */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-6 border border-slate-200 shadow-card-soft space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <h3 className="font-extrabold text-sm text-darkNavy">Control Room Users</h3>
            </div>
            <span className="text-[10px] font-mono text-slate-400">Admin Access Only</span>
          </div>

          {isAdmin ? (
            <>
              {/* Add User Form */}
              <form onSubmit={handleCreateUser} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
                <span className="font-bold text-darkNavy block">Add Staff Account</span>

                <input
                  type="text"
                  required
                  placeholder="Full Name"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white"
                />

                <input
                  type="email"
                  required
                  placeholder="Email Address"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white"
                />

                <input
                  type="password"
                  required
                  placeholder="Password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white"
                />

                <div className="flex items-center gap-2">
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-darkNavy"
                  >
                    <option value="operator">Operator (Controls)</option>
                    <option value="viewer">Viewer (Read Only)</option>
                    <option value="admin">Admin (Full)</option>
                  </select>

                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-primary hover:bg-blue-700 text-white font-bold cursor-pointer"
                  >
                    Create
                  </button>
                </div>
              </form>

              {/* Users List */}
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {usersList.map((u) => (
                  <div key={u.id} className="p-2.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-darkNavy">{u.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-blue-50 text-primary">
                        {u.role}
                      </span>
                      {u.id !== user?.id && (
                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          className="p-1 text-slate-400 hover:text-occupiedRed transition-colors"
                          title="Delete user"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-xs text-slate-400 font-medium">
              Administrator privileges required to view and modify user accounts.
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
