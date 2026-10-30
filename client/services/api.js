const API_BASE = '/api';

export function getAuthToken() {
  return localStorage.getItem('maargdarshak_token');
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem('maargdarshak_token', token);
  } else {
    localStorage.removeItem('maargdarshak_token');
  }
}

export async function apiRequest(endpoint, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && !endpoint.includes('/auth/login')) {
    setAuthToken(null);
    window.dispatchEvent(new Event('maargdarshak_auth_expired'));
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}: Failed request`);
  }
  return data;
}

export const api = {
  // Auth
  login: (email, password) => apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  getMe: () => apiRequest('/auth/me'),

  // Laser guidance (public: used by the gate kiosk)
  requestGuidance: (payload) => apiRequest('/guidance/request', { method: 'POST', body: JSON.stringify(payload) }),
  cancelGuidance: (ticket) => apiRequest(`/guidance/${ticket}`, { method: 'DELETE' }),
  getActiveGuidance: () => apiRequest('/guidance/active'),
  getGuidanceStats: () => apiRequest('/guidance/stats'),

  // Slots & Lot State
  getLotState: () => apiRequest('/lot/state'),
  getSlots: (params = '') => apiRequest(`/slots${params ? `?${params}` : ''}`),
  updateSlot: (id, payload) => apiRequest(`/slots/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  createSlot: (payload) => apiRequest('/slots', { method: 'POST', body: JSON.stringify(payload) }),
  deleteSlot: (id) => apiRequest(`/slots/${id}`, { method: 'DELETE' }),

  // Vehicles & Sessions
  getSessions: (params = '') => apiRequest(`/sessions${params ? `?${params}` : ''}`),
  manualEntry: (payload) => apiRequest('/vehicles/entry', { method: 'POST', body: JSON.stringify(payload) }),
  manualExit: (payload) => apiRequest('/vehicles/exit', { method: 'POST', body: JSON.stringify(payload) }),

  // Adaptive Layout
  getLayout: () => apiRequest('/layout'),
  previewLayout: (mode) => apiRequest('/layout/preview', { method: 'POST', body: JSON.stringify({ mode }) }),
  applyLayout: (mode, reason) => apiRequest('/layout/apply', { method: 'POST', body: JSON.stringify({ mode, reason }) }),
  updateGuidanceRule: (payload) => apiRequest('/layout/rules', { method: 'PATCH', body: JSON.stringify(payload) }),
  addSchedule: (payload) => apiRequest('/layout/schedule', { method: 'POST', body: JSON.stringify(payload) }),
  deleteSchedule: (id) => apiRequest(`/layout/schedule/${id}`, { method: 'DELETE' }),

  // Lasers
  getLasers: () => apiRequest('/lasers'),
  updateLaser: (id, payload) => apiRequest(`/lasers/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  testPattern: (unitId) => apiRequest('/lasers/test-pattern', { method: 'POST', body: JSON.stringify({ unitId }) }),

  // Devices
  getDevices: () => apiRequest('/devices'),
  updateDevice: (id, payload) => apiRequest(`/devices/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  // Alerts
  getAlerts: () => apiRequest('/alerts'),
  updateAlert: (id, status) => apiRequest(`/alerts/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  // Analytics
  getAnalyticsKpis: () => apiRequest('/analytics/kpis'),
  getOccupancyTrend: () => apiRequest('/analytics/occupancy-trend'),
  getEntriesByType: () => apiRequest('/analytics/entries-by-type'),
  getZoneUtilization: () => apiRequest('/analytics/zone-utilization'),
  getCapacityComparison: () => apiRequest('/analytics/capacity-comparison'),
  getRecentEvents: () => apiRequest('/analytics/recent-events'),

  // Settings
  getSettings: () => apiRequest('/settings'),
  updateSettings: (payload) => apiRequest('/settings', { method: 'POST', body: JSON.stringify(payload) }),
  getUsers: () => apiRequest('/settings/users'),
  createUser: (payload) => apiRequest('/settings/users', { method: 'POST', body: JSON.stringify(payload) }),
  deleteUser: (id) => apiRequest(`/settings/users/${id}`, { method: 'DELETE' }),
};
