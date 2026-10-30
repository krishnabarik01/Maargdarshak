import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, setAuthToken, getAuthToken } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('maargdarshak_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      api.getMe()
        .then(userData => {
          setUser(userData);
          localStorage.setItem('maargdarshak_user', JSON.stringify(userData));
        })
        .catch(() => {
          setUser(null);
          setAuthToken(null);
          localStorage.removeItem('maargdarshak_user');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }

    const handleExpired = () => {
      setUser(null);
      localStorage.removeItem('maargdarshak_user');
    };
    window.addEventListener('maargdarshak_auth_expired', handleExpired);
    return () => window.removeEventListener('maargdarshak_auth_expired', handleExpired);
  }, []);

  const login = async (email, password) => {
    const data = await api.login(email, password);
    setAuthToken(data.token);
    setUser(data.user);
    localStorage.setItem('maargdarshak_user', JSON.stringify(data.user));
    return data.user;
  };

  const logout = () => {
    setAuthToken(null);
    setUser(null);
    localStorage.removeItem('maargdarshak_user');
  };

  const canEdit = user?.role === 'admin' || user?.role === 'operator';
  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, canEdit, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
