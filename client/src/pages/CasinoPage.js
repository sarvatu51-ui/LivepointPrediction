import React, { useEffect, useState, useMemo } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import './CasinoPage.css';

const GAME_INFO = {
  aviator: { emoji: '✈️', desc: 'Cash out before the plane flies away!', color: '#6366f1' },
  mines:   { emoji: '💣', desc: 'Avoid the mines, multiply your points!', color: '#ef4444' },
  teen_patti: { emoji: '🃏', desc: 'Classic Indian card game, win big!', color: '#f59e0b' },
  rummy:   { emoji: '🎴', desc: 'Rummy style — skill meets luck!', color: '#10b981' }
};

const CasinoPage = () => {
  const { user, updatePoints } = useAuth();
  const [games, setGames] = useState([]);
  const [activeGame, setActiveGame] = useState('aviator');
  const [stake, setStake] = useState(50);
  const [clientSeed, setClientSeed] = useState('my-lucky-seed');
  const [history, setHistory] = useState([]);
  const [lastResult, setLastResult] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGames();
  }, []);

  useEffect(() => {
    fetchHistory(activeGame);
    setLastResult(null);
    setError('');
  }, [activeGame]);

  const fetchGames = async () => {
    try {
      const { data } = await api.get('/casino/games');
      setGames(data);
    } catch (err) {
      console.error('Failed to load games');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (gameKey) => {
    try {
      const { data } = await api.get('/casino/history', { params: { game: gameKey } });
      setHistory(data);
    } catch (err) {
      console.error('Failed to load history');
    }
  };

  const selectedGame = useMemo(() => games.find(g => g.key === activeGame), [games, activeGame]);

  const handlePlay = async () => {
    setError('');
    setLastResult(null);
    setPlaying(true);
    try {
      const { data } = await api.post(`/casino/play/${activeGame}`, {
        stake: Number(stake),
        clientSeed
      });
      setLastResult(data);
      updatePoints(data.pointsLeft);
      fetchHistory(activeGame);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to play. Try again.');
    } finally {
      setPlaying(false);
    }
  };

  const quickStakes = [10, 50, 100, 500, 1000];

  const stats = useMemo(() => {
    if (!history.length) return null;
    const won = history.filter(h => h.result === 'won');
    const totalStaked = history.reduce((s, h) => s + h.stake, 0);
    const totalPayout = history.reduce((s, h) => s + h.payout, 0);
    return {
      winRate: Math.round((won.length / history.length) * 100),
      totalStaked,
      netPL: totalPayout - totalStaked,
      bestWin: Math.max(...history.map(h => h.payout - h.stake), 0)
    };
  }, [history]);

  return (
    <div className="casino-page">
      <div className="container">
        {/* Header */}
        <div className="casino-header">
          <div>
            <h1 className="casino-title">🎰 Casino</h1>
            <p className="casino-sub">Provably fair games with virtual points</p>
          </div>
          <div className="casino-balance">
            <span className="balance-label">Your Balance</span>
            <span className="balance-val">₹ {user?.points?.toLocaleString()}</span>
          </div>
        </div>

        <div className="casino-layout">
          {/* Left - Game Selection + Play */}
          <div className="casino-left">
            {/* Game Tabs */}
            <div className="casino-games-grid">
              {loading ? (
                [1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 80 }} />)
              ) : (
                games.map(game => {
                  const info = GAME_INFO[game.key] || {};
                  return (
                    <button
                      key={game.key}
                      className={`game-card ${activeGame === game.key ? 'active' : ''}`}
                      onClick={() => setActiveGame(game.key)}
                      style={{ '--game-color': info.color }}
                    >
                      <span className="game-emoji">{info.emoji}</span>
                      <span className="game-name">{game.name}</span>
                      <span className="game-rtp">RTP {game.rtp}%</span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Play Panel */}
            {selectedGame && (
              <div className="play-panel card">
                <div className="play-panel-header">
                  <span className="play-game-emoji">{GAME_INFO[activeGame]?.emoji}</span>
                  <div>
                    <div className="play-game-name">{selectedGame.name}</div>
                    <div className="play-game-desc">{GAME_INFO[activeGame]?.desc}</div>
                  </div>
                </div>

                <div className="play-meta">
                  <span>Min: <strong>{selectedGame.minBet}</strong> pts</span>
                  <span>Max: <strong>{selectedGame.maxBet?.toLocaleString()}</strong> pts</span>
                  <span>RTP: <strong>{selectedGame.rtp}%</strong></span>
                </div>

                {/* Quick Stakes */}
                <div className="form-group">
                  <label className="form-label">Quick Stake</label>
                  <div className="quick-stakes">
                    {quickStakes.map(amt => (
                      <button
                        key={amt}
                        className={`quick-stake-btn ${stake === amt ? 'active' : ''}`}
                        onClick={() => setStake(amt)}
                        disabled={amt > user?.points}
                      >
                        {amt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stake Input */}
                <div className="form-group">
                  <label className="form-label">Stake Amount</label>
                  <div className="stake-input-wrap">
                    <span className="stake-icon">₹</span>
                    <input
                      type="number"
                      className="form-input stake-input"
                      value={stake}
                      onChange={e => setStake(Math.max(0, parseInt(e.target.value) || 0))}
                      min={selectedGame.minBet}
                      max={Math.min(selectedGame.maxBet, user?.points || 0)}
                    />
                  </div>
                </div>

                {/* Client Seed */}
                <div className="form-group">
                  <label className="form-label">Client Seed (for fairness)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={clientSeed}
                    onChange={e => setClientSeed(e.target.value)}
                    placeholder="Enter your seed"
                    maxLength={64}
                  />
                </div>

                {/* Potential win */}
                <div className="potential-win-bar">
                  <span>Potential Win</span>
                  <span className="potential-win-val">
                    Up to {Math.floor(stake * 10)} pts
                  </span>
                </div>

                {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

                {/* Result */}
                {lastResult && (
                  <div className={`result-banner ${lastResult.bet.result}`}>
                    <div className="result-emoji">
                      {lastResult.bet.result === 'won' ? '🎉' : '😔'}
                    </div>
                    <div className="result-text">
                      <div className="result-msg">{lastResult.message}</div>
                      <div className="result-details">
                        Multiplier: <strong>{lastResult.bet.multiplier}x</strong>
                        &nbsp;|&nbsp; Payout: <strong>{lastResult.bet.payout} pts</strong>
                        &nbsp;|&nbsp; Balance: <strong>{lastResult.pointsLeft?.toLocaleString()} pts</strong>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  className="btn btn-primary btn-lg play-btn"
                  onClick={handlePlay}
                  disabled={playing || stake < selectedGame.minBet || stake > (user?.points || 0)}
                >
                  {playing ? (
                    <span className="playing-anim">Playing...</span>
                  ) : (
                    `🎮 Play ${selectedGame.name} — ${stake} pts`
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Right - Stats + History */}
          <div className="casino-right">
            {/* Stats */}
            {stats && (
              <div className="casino-stats card">
                <div className="casino-stats-title">📊 Your Stats — {selectedGame?.name}</div>
                <div className="casino-stats-grid">
                  <div className="cstat">
                    <div className="cstat-val">{stats.winRate}%</div>
                    <div className="cstat-label">Win Rate</div>
                  </div>
                  <div className="cstat">
                    <div className="cstat-val">{history.length}</div>
                    <div className="cstat-label">Rounds</div>
                  </div>
                  <div className="cstat">
                    <div className={`cstat-val ${stats.netPL >= 0 ? 'green' : 'red'}`}>
                      {stats.netPL >= 0 ? '+' : ''}{stats.netPL}
                    </div>
                    <div className="cstat-label">Net P&L</div>
                  </div>
                  <div className="cstat">
                    <div className="cstat-val green">+{stats.bestWin}</div>
                    <div className="cstat-label">Best Win</div>
                  </div>
                </div>
              </div>
            )}

            {/* History */}
            <div className="casino-history card">
              <div className="history-title">🕐 Recent History — {selectedGame?.name}</div>
              {history.length === 0 ? (
                <div className="history-empty">No rounds yet. Start playing!</div>
              ) : (
                <div className="history-list">
                  {history.slice(0, 20).map(entry => (
                    <div key={entry._id} className={`history-row ${entry.result}`}>
                      <div className="history-result-icon">
                        {entry.result === 'won' ? '✅' : '❌'}
                      </div>
                      <div className="history-details">
                        <span className="history-multiplier">{entry.multiplier}x</span>
                        <span className="history-stake">Stake: {entry.stake}</span>
                      </div>
                      <div className={`history-payout ${entry.result}`}>
                        {entry.result === 'won' ? `+${entry.payout - entry.stake}` : `-${entry.stake}`}
                      </div>
                      <div className="history-nonce">#{entry.nonce}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Fairness info */}
            <div className="fairness-card card">
              <div className="fairness-title">🔐 Provably Fair</div>
              <div className="fairness-text">
                Every game result is determined by a server seed, your client seed, and a nonce.
                You can verify any result after the round using the seed hash.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CasinoPage;
