import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass, Lock, Mail, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (demoEmail, demoPassword) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setLoading(true);
    setError('');
    login(demoEmail, demoPassword)
      .then(() => navigate('/'))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  };

  return (
    <div className="min-h-screen bg-lightGray flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-white shadow-laser-blue">
            <Compass className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-darkNavy tracking-tight">Maargdarshak</h1>
            <p className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">मार्गदर्शक · Control room</p>
          </div>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 sm:px-10 rounded-3xl border border-slate-200 shadow-card-soft">
          
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-occupiedRed flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-darkNavy mb-1">Email Address</label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@maargdarshak.in"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <Mail className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-darkNavy mb-1">Password</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-primary hover:bg-blue-700 text-white font-bold text-xs shadow-laser-blue transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              <span>{loading ? 'Authenticating...' : 'Sign In to Control Room'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Seed Demo Account Quick Select */}
          <div className="mt-6 pt-6 border-t border-slate-100">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block mb-2 text-center">
              One-Click Demo Account Sign-In
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin('admin@maargdarshak.in', 'admin123')}
                className="p-2 rounded-xl border border-slate-200 hover:border-primary text-center hover:bg-blue-50 transition-all cursor-pointer"
              >
                <div className="text-xs font-bold text-darkNavy">Admin</div>
                <div className="text-[10px] text-slate-400">Full Control</div>
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('operator@maargdarshak.in', 'operator123')}
                className="p-2 rounded-xl border border-slate-200 hover:border-primary text-center hover:bg-blue-50 transition-all cursor-pointer"
              >
                <div className="text-xs font-bold text-darkNavy">Operator</div>
                <div className="text-[10px] text-slate-400">Control Room</div>
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('viewer@maargdarshak.in', 'viewer123')}
                className="p-2 rounded-xl border border-slate-200 hover:border-primary text-center hover:bg-blue-50 transition-all cursor-pointer"
              >
                <div className="text-xs font-bold text-darkNavy">Viewer</div>
                <div className="text-[10px] text-slate-400">Read Only</div>
              </button>
            </div>
          </div>

        </div>

        <div className="text-center mt-4 text-xs text-slate-400">
          <a href="/driver" className="hover:text-primary font-semibold underline">
            Open Public Driver Kiosk View →
          </a>
        </div>
      </div>
    </div>
  );
}
