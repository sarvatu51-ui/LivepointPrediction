import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.get('/auth/me')
        .then(res => setUser(res.data))
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  const register = async (name, email, password) => {
    const res = await api.post('/auth/register', { name, email, password });
    localStorage.setItem('token', res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  // ✅ Instantly update points in UI (no lag)
  const updateUser = useCallback((updatedUser) => {
    setUser(updatedUser);
  }, []);

  // ✅ Instantly update just the points number
  const updatePoints = useCallback((newPoints) => {
    setUser(prev => prev ? { ...prev, points: newPoints } : prev);
  }, []);

  // ✅ Re-fetch from DB (called after game to confirm)
  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data);
      return res.data;
    } catch (e) {
      console.error('refreshUser error:', e);
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user, loading, login, register, logout,
      updateUser, updatePoints, refreshUser
    }}>
      {children}
    </AuthContext.Provider>
  );
};
