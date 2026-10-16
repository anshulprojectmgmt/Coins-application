import React, { useState, useEffect, createContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout.tsx';
import { Dashboard } from './components/Dashboard.tsx';
import { Earn } from './components/Earn.tsx';
import { Spend } from './components/Spend.tsx';
import { Surprise } from './components/Surprise.tsx';
import { Auth } from './components/Auth.tsx';
import { Parent } from './components/Parent.tsx';
import { User } from './types.ts';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
  updateUser: (user: User) => void;
  parentToken: string | null;
  unlockParent: (token: string) => void;
  lockParent: () => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  // Parent authority is never saved in localStorage or shared with child sessions.
  const [parentToken, setParentToken] = useState<string | null>(null);
  const lockParent = () => setParentToken(null);
  const unlockParent = (value: string) => setParentToken(value);
  useEffect(() => {
    if (!parentToken) return;
    const timer = setTimeout(lockParent, 15 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [parentToken]);

  useEffect(() => {
    if (token) {
      fetch('/api/profile', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            logout();
          } else {
            setUser(data);
          }
        })
        .catch(() => logout())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = (user: User, token: string) => {
    setUser(user);
    setToken(token);
    localStorage.setItem('token', token);
  };

  const logout = () => {
    lockParent();
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
  };

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;

  return (
    <AuthContext.Provider value={{ user, token, login, logout, updateUser, parentToken, unlockParent, lockParent }}>
      <Router>
        <Routes>
          {!user ? (
            <Route path="*" element={<Auth />} />
          ) : (
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/earn" element={<Earn />} />
              <Route path="/spend" element={<Spend />} />
              <Route path="/surprise" element={<Surprise />} />
              <Route path="/parent" element={<Parent />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Route>
          )}
        </Routes>
      </Router>
    </AuthContext.Provider>
  );
}
