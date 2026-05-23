import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import './Wallet.css';

const GAME_LABELS = {
  aviator: '✈️ Aviator',
  mines: '💣 Mines',
  teen_patti: '🃏 Teen Patti',
  color_prediction: '🎨 Color Predict',
  match_bet: '🏏 Match Bet',
  session_bet: '🎯 Session Bet'
};

const Wallet = () => {
  const { user } = useAuth();
  const [casinoBets, setCasinoBets] = useState([]);
  const [matchBets, setMatchBets] = useState([]);
  const [casinoStats, setCasinoStats] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [casinoRes, matchRes, statsRes] = await Promise.all([
        api.get('/casino/history').catch(() => ({ data: [] })),
        api.get('/bets/my').catch(() => ({ data: [] })),
        api.get('/casino/stats').catch(() => ({ data: null }))
      ]);
      setCasinoBets(casinoRes.data || []);
      setMatchBets(matchRes.data || []);
      setCasinoStats(statsRes.data);
    } catch (e) {
      console.error('Wallet fetch error:', e);
    }
    setLoading(false);
  };

  // Combine and sort all bets by date
  const allBets = [
    ...casinoBets.map(b => ({
      ...b,
      type: 'casino',
      gameName: GAME_LABELS[b.game] || b.game,
      date: new Date(b.createdAt),
      won: b.result === 'won',
      netChange: b.result === 'won' ? b.payout - b.stake : -b.stake
    })),
    ...matchBets.map(b => ({
      ...b,
      type: 'match',
      gameName: '🏏 Match Bet',
      date: new Date(b.createdAt),
      won: b.result === 'won',
      netChange: b.result === 'won'
        ? Math.floor(b.pointsBet * b.oddsAtTime) - b.pointsBet
        : b.result === 'lost' ? -b.pointsBet : 0,
      stake: b.pointsBet,
      payout: b.result === 'won' ? Math.floor(b.pointsBet * b.oddsAtTime) : 0,
      multiplier: b.oddsAtTime
    }))
  ].sort((a, b) => b.date - a.date);

  const filtered = activeTab === 'all' ? allBets
    : activeTab === 'casino' ? allBets.filter(b => b.type === 'casino')
    : activeTab === 'matches' ? allBets.filter(b => b.type === 'match')
    : activeTab === 'won' ? allBets.filter(b => b.won)
    : allBets.filter(b => !b.won && b.result !== 'pending');

  const totalWins = allBets.filter(b => b.won).length;
  const totalLosses = allBets.filter(b => !b.won && b.result !== 'pending').length;
  const netProfit = allBets.reduce((s, b) => s + (b.netChange || 0), 0);
  const totalStaked = allBets.reduce((s, b) => s + (b.stake || 0), 0);

  const formatDate = (d) => {
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
    return d.toLocaleDateString('en-IN', { day:'numeric', month:'short' });
  };

  return (
    <div className="wallet-page">
      {/* Header */}
      <div className="wallet-header">
        <div className="wallet-title">
          <span className="wallet-icon">👛</span>
          <div>
            <h1>My Wallet</h1>
            <p>Points balance & bet history</p>
          </div>
        </div>
      </div>

      {/* Balance card */}
      <div className="balance-card">
        <div className="balance-main">
          <div className="balance-label">CURRENT BALANCE</div>
          <div className="balance-amount">
            <span className="balance-icon">🪙</span>
            <span className="balance-num">{(user?.points || 0).toLocaleString()}</span>
            <span className="balance-unit">pts</span>
          </div>
        </div>
        <div className="balance-stats">
          <div className="bal-stat">
            <div className="bal-stat-val green">+{allBets.filter(b=>b.won).reduce((s,b)=>s+(b.payout||0),0).toLocaleString()}</div>
            <div className="bal-stat-lbl">Total Won</div>
          </div>
          <div className="bal-stat-div" />
          <div className="bal-stat">
            <div className="bal-stat-val red">{allBets.filter(b=>!b.won&&b.result!=='pending').reduce((s,b)=>s+(b.stake||0),0).toLocaleString()}</div>
            <div className="bal-stat-lbl">Total Lost</div>
          </div>
          <div className="bal-stat-div" />
          <div className="bal-stat">
            <div className={`bal-stat-val ${netProfit>=0?'green':'red'}`}>
              {netProfit>=0?'+':''}{netProfit.toLocaleString()}
            </div>
            <div className="bal-stat-lbl">Net P&L</div>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="summary-grid">
        <div className="summary-card">
          <div className="sum-icon">🎯</div>
          <div className="sum-val">{allBets.length}</div>
          <div className="sum-lbl">Total Bets</div>
        </div>
        <div className="summary-card green-card">
          <div className="sum-icon">🏆</div>
          <div className="sum-val">{totalWins}</div>
          <div className="sum-lbl">Wins</div>
        </div>
        <div className="summary-card red-card">
          <div className="sum-icon">💸</div>
          <div className="sum-val">{totalLosses}</div>
          <div className="sum-lbl">Losses</div>
        </div>
        <div className="summary-card">
          <div className="sum-icon">📊</div>
          <div className="sum-val">
            {allBets.length > 0 ? Math.round((totalWins/allBets.length)*100) : 0}%
          </div>
          <div className="sum-lbl">Win Rate</div>
        </div>
      </div>

      {/* Bet History */}
      <div className="history-section">
        <div className="history-header">
          <h2>Bet History</h2>
          <button className="refresh-btn" onClick={fetchAll}>🔄 Refresh</button>
        </div>

        {/* Filter tabs */}
        <div className="filter-tabs">
          {['all','casino','matches','won','lost'].map(tab => (
            <button key={tab}
              className={`filter-tab ${activeTab===tab?'active':''}`}
              onClick={() => setActiveTab(tab)}>
              {tab==='all'?'All':tab==='casino'?'🎰 Casino':tab==='matches'?'🏏 Matches':tab==='won'?'✅ Won':'❌ Lost'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="wallet-loading">
            <div className="wallet-spinner" />
            <p>Loading your bet history...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-history">
            <div className="empty-icon">📭</div>
            <p>No bets found</p>
            <span>Start playing to see your history here!</span>
          </div>
        ) : (
          <div className="bet-list">
            {filtered.map((bet, i) => (
              <div key={i} className={`bet-row ${bet.won?'won':bet.result==='pending'?'pending':'lost'}`}>
                <div className="bet-left">
                  <div className="bet-game">{bet.gameName}</div>
                  <div className="bet-date">{formatDate(bet.date)}</div>
                  {bet.type==='match' && bet.selectedTeam && (
                    <div className="bet-team">Team: {bet.selectedTeam}</div>
                  )}
                </div>
                <div className="bet-mid">
                  <div className="bet-stake-row">
                    <span className="bet-label">Stake</span>
                    <span className="bet-stake-val">{(bet.stake||0).toLocaleString()} pts</span>
                  </div>
                  {bet.multiplier > 0 && (
                    <div className="bet-mult-row">
                      <span className="bet-label">Odds</span>
                      <span className="bet-mult-val">{bet.multiplier?.toFixed(2)}x</span>
                    </div>
                  )}
                </div>
                <div className="bet-right">
                  <div className={`bet-result-badge ${bet.won?'won':bet.result==='pending'?'pending':'lost'}`}>
                    {bet.won?'WON':bet.result==='pending'?'PENDING':'LOST'}
                  </div>
                  <div className={`bet-change ${bet.netChange>0?'positive':bet.netChange<0?'negative':'neutral'}`}>
                    {bet.netChange>0?'+':''}{(bet.netChange||0).toLocaleString()} pts
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Wallet;
