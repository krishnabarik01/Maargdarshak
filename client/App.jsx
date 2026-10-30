import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Layout from './components/Layout';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const LiveLotMapPage = lazy(() => import('./pages/LiveLotMapPage'));
const AdaptiveLayoutPage = lazy(() => import('./pages/AdaptiveLayoutPage'));
const LaserControlPage = lazy(() => import('./pages/LaserControlPage'));
const VehiclesSessionsPage = lazy(() => import('./pages/VehiclesSessionsPage'));
const DevicesSensorsPage = lazy(() => import('./pages/DevicesSensorsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const DriverViewPage = lazy(() => import('./pages/DriverViewPage'));
const LiveDemoPage = lazy(() => import('./pages/LiveDemoPage'));

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-lightGray flex items-center justify-center text-xs font-mono text-slate-500">
        Authenticating session...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<div className="min-h-screen bg-lightGray flex items-center justify-center text-xs font-mono text-slate-500">Loading…</div>}>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/driver" element={<DriverViewPage />} />

          {/* Protected Control Room Routes */}
          <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/lot-map" element={<ProtectedRoute><LiveLotMapPage /></ProtectedRoute>} />
          <Route path="/adaptive-layout" element={<ProtectedRoute><AdaptiveLayoutPage /></ProtectedRoute>} />
          <Route path="/live-demo" element={<ProtectedRoute><LiveDemoPage /></ProtectedRoute>} />
          <Route path="/laser-control" element={<ProtectedRoute><LaserControlPage /></ProtectedRoute>} />
          <Route path="/sessions" element={<ProtectedRoute><VehiclesSessionsPage /></ProtectedRoute>} />
          <Route path="/devices" element={<ProtectedRoute><DevicesSensorsPage /></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
          <Route path="/alerts" element={<ProtectedRoute><AlertsPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
