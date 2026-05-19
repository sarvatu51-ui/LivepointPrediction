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
  { id: 'teen_patti', label: 'Teen Patti', emoji: '🃏', desc: 'Classic Indian card game', hot: false },
  { id: 'color', label: 'Color Predict', emoji: '🎨', desc: 'Predict the winning color', hot: true },
];

const CasinoHub = () => {
  const { user, updateUser, refreshUser } = useAuth();
  const [activeGame, setActiveGame] = useState('aviator');
  const [localPoints, setLocalPoints] = useState(user?.points || 0);

  useEffect(() => { setLocalPoints(user?.points || 0); }, [user]);

  const handlePointsUpdate = async (newPoints) => {
    setLocalPoints(newPoints);
    updateUser({ points: newPoints });
    // Also refresh from DB to make sure it's accurate
    if (refreshUser) await refreshUser();
  };

  const fakeUser = { ...user, points: localPoints };

  const renderGame = () => {
    switch (activeGame) {
      case 'aviator': return <Aviator user={fakeUser} onPointsUpdate={handlePointsUpdate} />;
      case 'mines': return <Mines user={fakeUser} onPointsUpdate={handlePointsUpdate} />;
      case 'teen_patti': return <TeenPatti user={fakeUser} onPointsUpdate={handlePointsUpdate} />;
      case 'color': return <ColorPrediction user={fakeUser} onPointsUpdate={handlePointsUpdate} />;
      default: return null;
    }
  };

  return (
    <div className="casino-hub">
      <div className="casino-header">
        <div className="casino-title">
          <span className="casino-icon">🎰</span>
          <div>
            <h1>Casino Games</h1>
            <p>Play with virtual points • Win big!</p>
          </div>
        </div>
        <div className="pts-display">
          <span>🪙</span>
          <span className="pts-val">{localPoints?.toLocaleString()}</span>
        </div>
      </div>

      <div className="game-tabs">
        {GAMES.map(game => (
          <button key={game.id}
            className={`game-tab ${activeGame === game.id ? 'active' : ''}`}
            onClick={() => setActiveGame(game.id)}>
            {game.hot && <span className="hot-badge">HOT</span>}
            <span className="tab-emoji">{game.emoji}</span>
            <span className="tab-name">{game.label}</span>
          </button>
        ))}
      </div>

      <div className="game-area">
        <div className="game-title-bar">
          {GAMES.find(g => g.id === activeGame)?.emoji}{' '}
          <strong>{GAMES.find(g => g.id === activeGame)?.label}</strong>
          <span className="game-desc"> — {GAMES.find(g => g.id === activeGame)?.desc}</span>
        </div>
        {renderGame()}
      </div>
    </div>
  );
};

export default CasinoHub;
