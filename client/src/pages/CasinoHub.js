import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Aviator from './games/Aviator';
import Mines from './games/Mines';
import TeenPatti from './games/TeenPatti';
import ColorPrediction from './games/ColorPrediction';
import './CasinoHub.css';

const GAMES = [
  { id: 'aviator', label: 'Aviator', emoji: '✈️', desc: 'Cash out before it flies away!', hot: true },
  { id: 'mines', label: 'Mines', emoji: '💣', desc: 'Find diamonds, avoid bombs', hot: false },
  { id: 'teenpatti', label: 'Teen Patti', emoji: '🃏', desc: 'Classic Indian card game', hot: true },
  { id: 'colorprediction', label: 'Color Prediction', emoji: '🎨', desc: 'Predict the winning color', hot: false },
];

export default function CasinoHub() {
  const { user, logout } = useAuth();
  const [activeGame, setActiveGame] = useState(null);
  const [balance, setBalance] = useState(5000);
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    const savedBalance = localStorage.getItem('casino_balance');
    if (savedBalance) {
      setBalance(parseInt(savedBalance));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('casino_balance', balance);
  }, [balance]);

  const updateBalance = (amount) => {
    setBalance((prev) => prev + amount);
  };

  const renderGame = () => {
    switch (activeGame) {
      case 'aviator':
        return <Aviator balance={balance} updateBalance={updateBalance} />;
      case 'mines':
        return <Mines balance={balance} updateBalance={updateBalance} />;
      case 'teenpatti':
        return <TeenPatti balance={balance} updateBalance={updateBalance} />;
      case 'colorprediction':
        return <ColorPrediction balance={balance} updateBalance={updateBalance} />;
      default:
        return null;
    }
  };

  if (activeGame) {
    return (
      <div className="casino-game-screen">
        <div className="top-bar">
          <button className="back-btn" onClick={() => setActiveGame(null)}>
            ← Back
          </button>

          <div className="balance-box">
            ₹ {balance.toLocaleString()}
          </div>
        </div>

        {renderGame()}
      </div>
    );
  }

  return (
    <div className="casino-container">
      <header className="casino-header">
        <div className="logo">
          🎰 CasinoHub
        </div>

        <div className="header-actions">
          <div className="balance-display">
            ₹ {balance.toLocaleString()}
          </div>

          <div className="profile-wrapper">
            <button
              className="profile-btn"
              onClick={() => setShowProfile(!showProfile)}
            >
              👤
            </button>

            {showProfile && (
              <div className="profile-dropdown">
                <p>{user?.email}</p>

                <button onClick={logout}>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="hero-section">
        <h1>Welcome to CasinoHub</h1>

        <p>
          Play exciting casino games and test your luck!
        </p>

        <button className="deposit-btn">
          Deposit Now
        </button>
      </section>

      <section className="games-section">
        <h2>Popular Games</h2>

        <div className="games-grid">
          {GAMES.map((game) => (
            <div
              key={game.id}
              className="game-card"
              onClick={() => setActiveGame(game.id)}
            >
              {game.hot && (
                <span className="hot-badge">
                  HOT
                </span>
              )}

              <div className="game-emoji">
                {game.emoji}
              </div>

              <h3>{game.label}</h3>

              <p>{game.desc}</p>

              <button className="play-btn">
                Play Now
              </button>
            </div>
          ))}
        </div>
      </section>

      <footer className="casino-footer">
        <p>
          © 2026 CasinoHub. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
