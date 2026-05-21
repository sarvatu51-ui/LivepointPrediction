import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import './MatchDetail.css';
 
const MatchDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, updatePoints } = useAuth();
  const socket = useSocket();
 
  const [match, setMatch] = useState(null);
  const [userSessionBets, setUserSessionBets] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [betSlip, setBetSlip] = useState(null);
  const [betPoints, setBetPoints] = useState(100);
  const [betLoading, setBetLoading] = useState(false);
  const [betError, setBetError] = useState('');
  const [toast, setToast] = useState(null);
  const [userMatchBet, setUserMatchBet] = useState(null);
  const [cashoutLoading, setCashoutLoading] = useState(false); // ← NEW
  const [liveScore, setLiveScore] = useState(null);            // ← NEW
 
  useEffect(() => {
    fetchMatch();
    if (user) fetchUserBets();
  }, [id]);
 
  useEffect(() => {
    if (!socket) return;
    socket.on('matchUpdated', (updated) => {
      if (updated._id === id) setMatch(updated);
    });
    socket.on('oddsUpdated', ({ matchId, oddsTeamA, oddsTeamB }) => {
      if (matchId === id) setMatch(prev => prev ? { ...prev, oddsTeamA, oddsTeamB } : prev);
    });
    socket.on('sessionSettled', () => { fetchMatch(); fetchUserBets(); });
 
    // ← NEW: live ball-by-ball updates
    socket.on('liveScore', ({ matchId, scoreData, score, runRate, lastBall }) => {
      if (matchId === id) {
        setLiveScore({ scoreData, runRate, lastBall });
        setMatch(prev => prev ? { ...prev, score, runRate, lastBall } : prev);
      }
    });
 
    return () => {
      socket.off('matchUpdated');
      socket.off('oddsUpdated');
      socket.off('sessionSettled');
      socket.off('liveScore'); // ← NEW
    };
  }, [socket, id]);
 
  const fetchMatch = async () => {
    try {
      const res = await api.get(`/matches/${id}`);
      setMatch(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };
 
  const fetchUserBets = async () => {
    try {
      const [sessionRes, matchRes] = await Promise.all([
        api.get(`/sessions/${id}/my-bets`),
        api.get('/bets/my-bets')
      ]);
      const sbMap = {};
      sessionRes.data.forEach(b => { sbMap[b.sessionType] = b; });
      setUserSessionBets(sbMap);
      const mb = matchRes.data.find(b => (b.matchId._id || b.matchId) === id);
      setUserMatchBet(mb || null);
    } catch (err) { console.error(err); }
  };
 
  const openBetSlip = (type, label, odds, sessionType = null, prediction = null, line = null) => {
    if (!user) return navigate('/login');
    setBetSlip({ type, label, odds, sessionType, prediction, line });
    setBetPoints(100);
    setBetError('');
  };
 
  const placeBet = async () => {
    if (!betSlip) return;
    setBetLoading(true);
    setBetError('');
    try {
      if (betSlip.type === 'match') {
        const res = await api.post('/bets', { matchId: id, selectedTeam: betSlip.prediction, pointsBet: parseInt(betPoints) });
        updatePoints(res.data.newPoints);
        setUserMatchBet(res.data.bet);
      } else {
        const res = await api.post('/sessions/bet', {
          matchId: id, sessionType: betSlip.sessionType, sessionLabel: betSlip.label,
          prediction: betSlip.prediction, line: betSlip.line,
          pointsBet: parseInt(betPoints), oddsAtTime: betSlip.odds
        });
        updatePoints(res.data.newPoints);
        setUserSessionBets(prev => ({ ...prev, [betSlip.sessionType]: res.data.bet }));
      }
      setBetSlip(null);
      showToast('Bet placed successfully! 🎯');
    } catch (err) {
      setBetError(err.response?.data?.message || 'Failed to place bet.');
    } finally { setBetLoading(false); }
  };
 
  // ── NEW: Cashout function ─────────────────────────────────────────────────
  const handleCashout = async () => {
    if (!userMatchBet || userMatchBet.status !== 'active') return;
    if (!window.confirm('Cash out your bet now?')) return;
    setCashoutLoading(true);
    try {
      const res = await api.post('/activematch/cashout', {
        betId: userMatchBet._id,
        userId: user._id
      });
      updatePoints(res.data.newPoints);
      setUserMatchBet(prev => ({ ...prev, status: 'cashout', cashoutValue: res.data.cashoutValue }));
      showToast(`💰 Cashed out for ${res.data.cashoutValue} points!`);
    } catch (err) {
      showToast(err.response?.data?.error || 'Cashout failed', 'error');
    } finally { setCashoutLoading(false); }
  };
 
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };
 
  if (loading) return <div className="match-detail-loading"><div className="loading-spinner" /><p>Loading match...</p></div>;
  if (!match) return <div className="match-detail-loading"><p>Match not found</p></div>;
 
  const openSessions = (match.sessions || []).filter(s => s.isOpen && !s.result);
  const tossSession = openSessions.find(s => s.sessionType === 'toss');
  const overSessions = openSessions.filter(s => s.sessionType !== 'toss');
 
  // Calculate cashout value for display
  const currentOdds = userMatchBet?.selectedTeam === 'teamA' ? match.oddsTeamA : match.oddsTeamB;
  const estimatedCashout = userMatchBet?.status === 'active'
    ? Math.floor((userMatchBet.pointsBet * userMatchBet.oddsAtTime) / currentOdds * 0.90)
    : 0;
 
  return (
    <div className="match-detail-page">
      {/* Header */}
      <div className="md-header">
        <button className="back-btn" onClick={() => navigate('/')}>← Back</button>
        <div className="md-header-info">
          <span className={`badge badge-${match.status}`}>{match.status}</span>
          <span className="md-sport">{match.sport}</span>
        </div>
      </div>
 
      {/* Score Card */}
      <div className="md-scorecard card">
        <div className="md-teams-row">
          <div className="md-team">
            <div className="md-team-logo">{match.teamALogo || match.teamA.charAt(0)}</div>
            <div className="md-team-name">{match.teamA}</div>
            {match.isCricket && match.score?.teamA?.runs > 0 && (
              <div className="md-score-display">
                {match.score.teamA.runs}/{match.score.teamA.wickets}
                <span className="md-overs">({match.score.teamA.overs} ov)</span>
              </div>
            )}
          </div>
          <div className="md-vs-col">
            <span className="md-vs">VS</span>
            {match.status === 'live' && <div className="live-indicator"><span className="live-dot-anim" />LIVE</div>}
            {match.tossWinner && (
              <div className="toss-info">🪙 {match.tossWinner === 'teamA' ? match.teamA : match.teamB} won toss</div>
            )}
          </div>
          <div className="md-team">
            <div className="md-team-logo">{match.teamBLogo || match.teamB.charAt(0)}</div>
            <div className="md-team-name">{match.teamB}</div>
            {match.isCricket && match.score?.teamB?.runs > 0 && (
              <div className="md-score-display">
                {match.score.teamB.runs}/{match.score.teamB.wickets}
                <span className="md-overs">({match.score.teamB.overs} ov)</span>
              </div>
            )}
          </div>
        </div>
 
        {/* ── NEW: Live ball ticker ── */}
        {match.status === 'live' && match.lastBall && (
          <div className="live-ticker">
            <span className="live-ticker-label">🏏 Last ball:</span>
            <span className="live-ticker-text">{match.lastBall}</span>
            {match.runRate && <span className="live-rr">RR: {match.runRate}</span>}
          </div>
        )}
      </div>
 
      {/* Tabs */}
      <div className="md-tabs">
        {['all', 'match odds', 'session', 'fancy'].map(tab => (
          <button key={tab} className={`md-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>
 
      {/* Match Odds Section */}
      {(activeTab === 'all' || activeTab === 'match odds') && match.status !== 'ended' && (
        <div className="md-section">
          <div className="md-section-title">Match Odds</div>
          <div className="odds-table">
            <div className="odds-table-header">
              <span></span>
              <span className="back-label">Back</span>
              <span className="lay-label">Lay</span>
            </div>
            {/* Team A */}
            <div className={`odds-row ${userMatchBet?.selectedTeam === 'teamA' ? 'betted' : ''}`}>
              <span className="odds-team-name">{match.teamA}</span>
              <button className="odds-back-btn" onClick={() => !userMatchBet && openBetSlip('match', `${match.teamA} to Win`, match.oddsTeamA, null, 'teamA')} disabled={!!userMatchBet}>
                <span className="odds-price">{match.oddsTeamA.toFixed(2)}</span>
                <span className="odds-size">100</span>
              </button>
              <button className="odds-lay-btn" disabled>
                <span className="odds-price">{(match.oddsTeamA + 0.02).toFixed(2)}</span>
                <span className="odds-size">100</span>
              </button>
            </div>
            {/* Team B */}
            <div className={`odds-row ${userMatchBet?.selectedTeam === 'teamB' ? 'betted' : ''}`}>
              <span className="odds-team-name">{match.teamB}</span>
              <button className="odds-back-btn" onClick={() => !userMatchBet && openBetSlip('match', `${match.teamB} to Win`, match.oddsTeamB, null, 'teamB')} disabled={!!userMatchBet}>
                <span className="odds-price">{match.oddsTeamB.toFixed(2)}</span>
                <span className="odds-size">100</span>
              </button>
              <button className="odds-lay-btn" disabled>
                <span className="odds-price">{(match.oddsTeamB + 0.02).toFixed(2)}</span>
                <span className="odds-size">100</span>
              </button>
            </div>
 
            {/* ── NEW: Bet info + Cashout ── */}
            {userMatchBet && (
              <div className="already-bet-bar">
                {userMatchBet.status === 'active' ? (
                  <div className="bet-cashout-row">
                    <span>✅ You backed: <strong>{userMatchBet.selectedTeam === 'teamA' ? match.teamA : match.teamB}</strong> @ {userMatchBet.oddsAtTime}x for {userMatchBet.pointsBet} pts</span>
                    {match.status === 'live' && (
                      <button className="btn btn-cashout btn-sm" onClick={handleCashout} disabled={cashoutLoading}>
                        {cashoutLoading ? 'Processing...' : `💸 Cashout (${estimatedCashout} pts)`}
                      </button>
                    )}
                  </div>
                ) : userMatchBet.status === 'cashout' ? (
                  <span>💸 Cashed out for <strong>{userMatchBet.cashoutValue} pts</strong></span>
                ) : (
                  <span>✅ You backed: {userMatchBet.selectedTeam === 'teamA' ? match.teamA : match.teamB} @ {userMatchBet.oddsAtTime}x for {userMatchBet.pointsBet} pts</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
 
      {/* Toss Section */}
      {(activeTab === 'all' || activeTab === 'session') && tossSession && (
        <div className="md-section">
          <div className="md-section-title">🪙 Toss</div>
          <div className="odds-table">
            <div className="odds-table-header">
              <span></span>
              <span className="back-label">Back</span>
              <span className="lay-label">Lay</span>
            </div>
            <div className={`odds-row ${userSessionBets['toss'] ? 'betted' : ''}`}>
              <span className="odds-team-name">{match.teamA}</span>
              <button className="odds-back-btn" onClick={() => !userSessionBets['toss'] && openBetSlip('session', 'Toss - ' + match.teamA, tossSession.oddsTeamA, 'toss', 'teamA')} disabled={!!userSessionBets['toss']}>
                <span className="odds-price">{tossSession.oddsTeamA?.toFixed(2)}</span>
                <span className="odds-size">100</span>
              </button>
              <button className="odds-lay-btn" disabled>
                <span className="odds-price">{((tossSession.oddsTeamA || 1.9) + 0.02).toFixed(2)}</span>
                <span className="odds-size">100</span>
              </button>
            </div>
            <div className={`odds-row ${userSessionBets['toss'] ? 'betted' : ''}`}>
              <span className="odds-team-name">{match.teamB}</span>
              <button className="odds-back-btn" onClick={() => !userSessionBets['toss'] && openBetSlip('session', 'Toss - ' + match.teamB, tossSession.oddsTeamB, 'toss', 'teamB')} disabled={!!userSessionBets['toss']}>
                <span className="odds-price">{tossSession.oddsTeamB?.toFixed(2)}</span>
                <span className="odds-size">100</span>
              </button>
              <button className="odds-lay-btn" disabled>
                <span className="odds-price">{((tossSession.oddsTeamB || 1.9) + 0.02).toFixed(2)}</span>
                <span className="odds-size">100</span>
              </button>
            </div>
            {userSessionBets['toss'] && (
              <div className="already-bet-bar">✅ You backed: {userSessionBets['toss'].prediction === 'teamA' ? match.teamA : match.teamB} toss</div>
            )}
          </div>
        </div>
      )}
 
      {/* Over Sessions */}
      {(activeTab === 'all' || activeTab === 'session' || activeTab === 'fancy') && overSessions.length > 0 && (
        <div className="md-section">
          <div className="md-section-title">📊 Session Markets</div>
          <div className="fancy-table">
            <div className="fancy-header">
              <span>Market</span>
              <span className="no-label">No (Under)</span>
              <span className="yes-label">Yes (Over)</span>
            </div>
            {overSessions.map(session => {
              const myBet = userSessionBets[session.sessionType];
              return (
                <div key={session.sessionType} className={`fancy-row ${myBet ? 'betted' : ''}`}>
                  <div className="fancy-name">
                    <span>{session.label}</span>
                    {session.line && <span className="fancy-line">Line: {session.line}</span>}
                    {myBet && <span className="my-bet-tag">✅ {myBet.prediction === 'over' ? 'Over' : 'Under'} @ {myBet.oddsAtTime}x</span>}
                  </div>
                  <button className="fancy-no-btn" onClick={() => !myBet && openBetSlip('session', session.label, session.oddsUnder, session.sessionType, 'under', session.line)} disabled={!!myBet}>
                    <span className="fancy-odds">{session.oddsUnder?.toFixed(2)}</span>
                    <span className="fancy-runs">{session.line}</span>
                  </button>
                  <button className="fancy-yes-btn" onClick={() => !myBet && openBetSlip('session', session.label, session.oddsOver, session.sessionType, 'over', session.line)} disabled={!!myBet}>
                    <span className="fancy-odds">{session.oddsOver?.toFixed(2)}</span>
                    <span className="fancy-runs">{session.line}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
 
      {openSessions.length === 0 && match.status === 'upcoming' && (
        <div className="md-empty">
          <div className="md-empty-icon">⏳</div>
          <div>Sessions will be available when the match goes live</div>
        </div>
      )}
 
      {/* Bet Slip */}
      {betSlip && (
        <div className="betslip-overlay" onClick={() => setBetSlip(null)}>
          <div className="betslip-drawer" onClick={e => e.stopPropagation()}>
            <div className="betslip-header">
              <div className="betslip-title">Place Bet</div>
              <button className="betslip-close" onClick={() => setBetSlip(null)}>✕</button>
            </div>
            <div className="betslip-selection">
              <span className="betslip-label">{betSlip.label}</span>
              <span className="betslip-odds">{betSlip.odds?.toFixed(2)}x</span>
            </div>
            <div className="betslip-quick">
              {[50, 100, 250, 500].map(amt => (
                <button key={amt} className={`betslip-quick-btn ${betPoints === amt ? 'active' : ''}`} onClick={() => setBetPoints(amt)}>{amt}</button>
              ))}
            </div>
            <div className="betslip-input-row">
              <input type="number" className="form-input" value={betPoints} onChange={e => setBetPoints(Math.max(10, parseInt(e.target.value) || 0))} min="10" max={user?.points} />
              <div className="betslip-potential">Win: <strong>{Math.floor(betPoints * betSlip.odds)} pts</strong></div>
            </div>
            <div className="betslip-balance">Balance: {user?.points?.toLocaleString()} pts</div>
            {betError && <div className="alert alert-error" style={{ marginBottom: 10, fontSize: 13 }}>{betError}</div>}
            <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={placeBet} disabled={betLoading}>
              {betLoading ? 'Placing...' : `Place Bet — ${betPoints} pts`}
            </button>
          </div>
        </div>
      )}
 
      {toast && <div className="toast alert alert-success">{toast}</div>}
    </div>
  );
};
 
export default MatchDetail;
 
