import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Navbar.css';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };
  const isActive = (path) => location.pathname === path ? 'active' : '';

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-logo">
          <span className="logo-icon">⚡</span>
          <span className="logo-text">Live<span className="logo-accent">Point</span>Predict</span>
        </Link>

        {user && (
          <div className="navbar-links">
            <Link to="/" className={`nav-link ${isActive('/')}`}>Matches</Link>
            <Link to="/casino" className={`nav-link ${isActive('/casino')}`}>🎰 Casino</Link>
            <Link to="/dashboard" className={`nav-link ${isActive('/dashboard')}`}>Dashboard</Link>
            {user.role === 'admin' && (
              <Link to="/admin" className={`nav-link nav-admin ${isActive('/admin')}`}>Admin</Link>
            )}
          </div>
        )}

        <div className="navbar-right">
          {user ? (
            <>
              {/* Wallet / Points pill — clickable */}
              <Link to="/wallet" className="points-pill" title="View wallet & bet history">
                <span className="points-icon">₹</span>
                <span className="points-amount">{(user.points || 0).toLocaleString()}</span>
              </Link>

              <div className="user-menu" onClick={() => setMenuOpen(!menuOpen)}>
                <div className="user-avatar">{user.name?.charAt(0).toUpperCase()}</div>
                <span className="user-name">{user.name}</span>
                <span className="chevron">▾</span>
                {menuOpen && (
                  <div className="dropdown">
                    <div className="dropdown-header">
                      <div className="dropdown-name">{user.name}</div>
                      <div className="dropdown-email">{user.email}</div>
                    </div>
                    <Link to="/wallet" className="dropdown-item" onClick={() => setMenuOpen(false)}>
                      👛 My Wallet
                    </Link>
                    <Link to="/dashboard" className="dropdown-item" onClick={() => setMenuOpen(false)}>
                      📊 Dashboard
                    </Link>
                    <Link to="/casino" className="dropdown-item" onClick={() => setMenuOpen(false)}>
                      🎰 Casino
                    </Link>
                    <button className="dropdown-item danger" onClick={handleLogout}>
                      🚪 Logout
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="auth-buttons">
              <Link to="/login" className="btn btn-ghost btn-sm">Login</Link>
              <Link to="/register" className="btn btn-primary btn-sm">Sign Up</Link>
            </div>
          )}
          <button className="mobile-toggle" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {menuOpen && user && (
        <div className="mobile-menu">
          <Link to="/" className="mobile-link" onClick={() => setMenuOpen(false)}>Matches</Link>
          <Link to="/casino" className="mobile-link" onClick={() => setMenuOpen(false)}>🎰 Casino</Link>
          <Link to="/dashboard" className="mobile-link" onClick={() => setMenuOpen(false)}>Dashboard</Link>
          <Link to="/wallet" className="mobile-link" onClick={() => setMenuOpen(false)}>👛 Wallet</Link>
          {user.role === 'admin' && (
            <Link to="/admin" className="mobile-link" onClick={() => setMenuOpen(false)}>Admin Panel</Link>
          )}
          <button className="mobile-link danger" onClick={handleLogout}>Logout</button>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
