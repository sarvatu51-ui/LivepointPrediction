import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { useSocket } from '../context/SocketContext';
import TransactionStats from '../components/TransactionStats';
import './Admin.css';
 
const Admin = () => {
  const socket = useSocket();
  const [tab, setTab] = useState('matches');
  const [matches, setMatches] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [editingOdds, setEditingOdds] = useState({});
  const [sessionModal, setSessionModal] = useState(null);
  const [newSession, setNewSession] = useState({ sessionType: '', label: '', line: '', oddsOver: 1.9, oddsUnder: 1.9, oddsTeamA: 1.9, oddsTeamB: 1.9 });
  const [settleModal, setSettleModal] = useState(null);
  const [settleValue, setSettleValue] = useState('');
  const [activeMatchId, setActiveMatchId] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [battingTeam, setBattingTeam] = useState('teamA'); // ← NEW: tracks innings
 
  const [newMatch, setNewMatch] = useState({
    teamA: '', teamB: '', teamALogo: '', teamBLogo: '',
    oddsTeamA: 1.9, oddsTeamB: 1.9, oddsDraw: '',
    sport: 'Cricket', status: 'upcoming', isCricket: true, cricApiMatchId: ''
  });
 
  useEffect(() => { fetchMatches(); fetchTransactions(); fetchActiveMatch(); }, []);
 
  useEffect(() => {
    if (!socket) return;
    socket.on('newTransactionRequest', () => { fetchTransactions(); });
    socket.on('activematchChanged', ({ matchId }) => { setActiveMatchId(matchId); }); // ← NEW
    return () => { socket.off('newTransactionRequest'); socket.off('activematchChanged'); };
  }, [socket]);
 
  const fetchMatches = async () => {
    try { const res = await api.get('/matches'); setMatches(res.data); }
    catch (err) { showToast('Failed to load matches', 'error'); }
    finally { setLoading(false); }
  };
 
  const fetchTransactions = async () => {
    try { const res = await api.get('/transactions/all'); setTransactions(res.data); }
    catch (err) { console.error(err); }
  };
 
  // ── NEW: fetch which match is currently live ─────────────────────────────
  const fetchActiveMatch = async () => {
    try {
      const res = await api.get('/activematch');
      setActiveMatchId(res.data.matchId || null);
      setBattingTeam(res.data.battingTeam || 'teamA');
    } catch (err) { console.error(err); }
  };

  // Switch innings — call when first innings ends
  const switchInnings = async () => {
    try {
      const res = await api.post('/activematch/switchinnings');
      setBattingTeam(res.data.battingTeam);
      showToast(`🔄 Switched to 2nd innings — now tracking ${res.data.battingTeam === 'teamA' ? matches.find(m => m._id === activeMatchId)?.teamA : matches.find(m => m._id === activeMatchId)?.teamB}`);
    } catch (err) { showToast('Failed to switch innings', 'error'); }
  };
 
  // ── NEW: set a match as the live match (bot sends scores here) ───────────
  const setAsLiveMatch = async (matchId) => {
    setLiveLoading(true);
    try {
      await api.post('/activematch/set', { matchId });
      setActiveMatchId(matchId);
      // Also set status to live
      setMatches(prev => prev.map(m => ({
        ...m,
        status: m._id === matchId ? 'live' : m.status
      })));
      showToast('✅ Live match set! Bot will now send scores here.');
    } catch (err) {
      showToast('Failed to set live match', 'error');
    } finally { setLiveLoading(false); }
  };
 
  // ── NEW: clear live match ────────────────────────────────────────────────
  const clearLiveMatch = async () => {
    try {
      await api.post('/activematch/clear');
      setActiveMatchId(null);
      showToast('Live match cleared');
    } catch (err) { showToast('Failed', 'error'); }
  };
 
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };
 
  const handleAddMatch = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...newMatch };
      if (!payload.oddsDraw) delete payload.oddsDraw;
      if (!payload.cricApiMatchId) delete payload.cricApiMatchId;
      await api.post('/matches', payload);
      setNewMatch({ teamA: '', teamB: '', teamALogo: '', teamBLogo: '', oddsTeamA: 1.9, oddsTeamB: 1.9, oddsDraw: '', sport: 'Cricket', status: 'upcoming', isCricket: true, cricApiMatchId: '' });
      setTab('matches');
      fetchMatches();
      showToast('Match created!');
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
  };
 
  const updateMatch = async (matchId, updates) => {
    try {
      const res = await api.put(`/matches/${matchId}`, updates);
      setMatches(prev => prev.map(m => m._id === matchId ? res.data : m));
      showToast('Updated!');
    } catch (err) { showToast('Update failed', 'error'); }
  };
 
  const deleteMatch = async (matchId) => {
    if (!window.confirm('Delete this match?')) return;
    try { await api.delete(`/matches/${matchId}`); setMatches(prev => prev.filter(m => m._id !== matchId)); showToast('Deleted'); }
    catch (err) { showToast('Delete failed', 'error'); }
  };
 
  const saveOdds = (matchId) => {
    const odds = editingOdds[matchId];
    if (!odds) return;
    updateMatch(matchId, { oddsTeamA: parseFloat(odds.oddsTeamA), oddsTeamB: parseFloat(odds.oddsTeamB) });
    setEditingOdds(prev => { const n = { ...prev }; delete n[matchId]; return n; });
  };
 
  const addSession = async (matchId) => {
    try {
      const match = matches.find(m => m._id === matchId);
      const isToss = newSession.sessionType === 'toss';
      const sessionPayload = {
        sessionType: newSession.sessionType || `session_${Date.now()}`,
        label: newSession.label,
        line: isToss ? null : parseFloat(newSession.line) || null,
        oddsOver: isToss ? null : parseFloat(newSession.oddsOver),
        oddsUnder: isToss ? null : parseFloat(newSession.oddsUnder),
        oddsTeamA: isToss ? parseFloat(newSession.oddsTeamA) : null,
        oddsTeamB: isToss ? parseFloat(newSession.oddsTeamB) : null,
        isOpen: true
      };
      const updatedSessions = [...(match.sessions || []), sessionPayload];
      const res = await api.put(`/matches/${matchId}`, { sessions: updatedSessions });
      setMatches(prev => prev.map(m => m._id === matchId ? res.data : m));
      setSessionModal(null);
      setNewSession({ sessionType: '', label: '', line: '', oddsOver: 1.9, oddsUnder: 1.9, oddsTeamA: 1.9, oddsTeamB: 1.9 });
      showToast('Session added!');
    } catch (err) { showToast('Failed to add session', 'error'); }
  };
 
  const settleSession = async () => {
    if (!settleModal) return;
    const { match, session } = settleModal;
    if (!settleValue) return showToast('Select a result', 'error');
    try {
      await api.put(`/sessions/${match._id}/settle`, { sessionType: session.sessionType, result: settleValue, actualValue: parseFloat(settleValue) || null });
      fetchMatches();
      setSettleModal(null);
      showToast('Session settled!');
    } catch (err) { showToast('Failed to settle', 'error'); }
  };
 
  const closeSession = async (matchId, sessionType) => {
    const match = matches.find(m => m._id === matchId);
    const updatedSessions = match.sessions.map(s => s.sessionType === sessionType ? { ...s, isOpen: false } : s);
    await updateMatch(matchId, { sessions: updatedSessions });
  };
 
  const processTransaction = async (txnId, action, note = '') => {
    try { await api.put(`/transactions/${txnId}/${action}`, { note }); fetchTransactions(); showToast(`Transaction ${action}d!`); }
    catch (err) { showToast('Failed', 'error'); }
  };
 
  const pendingTxns = transactions.filter(t => t.status === 'pending');
 
  return (
    <div className="admin-page">
      <div className="container">
        <div className="admin-header">
          <h1 className="admin-title">⚙️ Admin Panel</h1>
          <p className="admin-sub">Manage matches, sessions, and transactions</p>
        </div>
 
        {/* ── NEW: Live Match Banner ── */}
        {activeMatchId && (
          <div className="live-match-banner">
            <span>🔴 LIVE BOT ACTIVE — Scores sending to: <strong>{matches.find(m => m._id === activeMatchId)?.teamA} vs {matches.find(m => m._id === activeMatchId)?.teamB}</strong></span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, opacity: 0.8 }}>Batting: <strong>{battingTeam === 'teamA' ? matches.find(m => m._id === activeMatchId)?.teamA : matches.find(m => m._id === activeMatchId)?.teamB}</strong></span>
              <button className="btn btn-sm" style={{ background: '#f59e0b', color: '#000', border: 'none' }} onClick={switchInnings}>🔄 Switch Innings</button>
              <button className="btn btn-danger btn-sm" onClick={clearLiveMatch}>Stop Live</button>
            </div>
          </div>
        )}
 
        {/* Tabs */}
        <div className="admin-tabs">
          <button className={`admin-tab ${tab === 'matches' ? 'active' : ''}`} onClick={() => setTab('matches')}>📋 Matches ({matches.length})</button>
          <button className={`admin-tab ${tab === 'add' ? 'active' : ''}`} onClick={() => setTab('add')}>➕ Add Match</button>
          <button className={`admin-tab ${tab === 'transactions' ? 'active' : ''}`} onClick={() => setTab('transactions')}>
            💳 Transactions {pendingTxns.length > 0 && <span className="txn-badge">{pendingTxns.length}</span>}
          </button>
        </div>
 
        {/* ── ADD MATCH ── */}
        {tab === 'add' && (
          <div className="card admin-form-card animate-in">
            <h2 className="form-section-title">Create New Match</h2>
            <form onSubmit={handleAddMatch} className="admin-form">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Team A *</label>
                  <input className="form-input" value={newMatch.teamA} onChange={e => setNewMatch({ ...newMatch, teamA: e.target.value })} placeholder="e.g. India" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Team B *</label>
                  <input className="form-input" value={newMatch.teamB} onChange={e => setNewMatch({ ...newMatch, teamB: e.target.value })} placeholder="e.g. Australia" required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Team A Emoji</label>
                  <input className="form-input" value={newMatch.teamALogo} onChange={e => setNewMatch({ ...newMatch, teamALogo: e.target.value })} placeholder="🇮🇳" />
                </div>
                <div className="form-group">
                  <label className="form-label">Team B Emoji</label>
                  <input className="form-input" value={newMatch.teamBLogo} onChange={e => setNewMatch({ ...newMatch, teamBLogo: e.target.value })} placeholder="🇦🇺" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Odds Team A *</label>
                  <input type="number" step="0.01" min="1.01" className="form-input" value={newMatch.oddsTeamA} onChange={e => setNewMatch({ ...newMatch, oddsTeamA: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Odds Team B *</label>
                  <input type="number" step="0.01" min="1.01" className="form-input" value={newMatch.oddsTeamB} onChange={e => setNewMatch({ ...newMatch, oddsTeamB: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Draw Odds</label>
                  <input type="number" step="0.01" min="1.01" className="form-input" value={newMatch.oddsDraw} onChange={e => setNewMatch({ ...newMatch, oddsDraw: e.target.value })} placeholder="Optional" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Sport</label>
                  <select className="form-input" value={newMatch.sport} onChange={e => setNewMatch({ ...newMatch, sport: e.target.value, isCricket: e.target.value === 'Cricket' })}>
                    {['Cricket', 'Football', 'Basketball', 'Tennis', 'Esports', 'Other'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-input" value={newMatch.status} onChange={e => setNewMatch({ ...newMatch, status: e.target.value })}>
                    <option value="upcoming">Upcoming</option>
                    <option value="live">Live</option>
                  </select>
                </div>
              </div>
              <button type="submit" className="btn btn-primary btn-lg">Create Match</button>
            </form>
          </div>
        )}
 
        {/* ── MATCHES ── */}
        {tab === 'matches' && (
          <div className="admin-matches">
            {loading ? <div className="skeleton" style={{ height: 200 }} /> : matches.length === 0 ? (
              <div className="empty-admin">No matches yet. Create one!</div>
            ) : matches.map(match => (
              <div key={match._id} className={`admin-match-card card ${match.status}`}>
                <div className="am-header">
                  <div className="am-teams">
                    <span className="am-team">{match.teamALogo} {match.teamA}</span>
                    <span className="am-vs">vs</span>
                    <span className="am-team">{match.teamBLogo} {match.teamB}</span>
                    {match.isCricket && <span className="cricket-tag">🏏 Cricket</span>}
                  </div>
                  <div className="am-meta">
                    <span className={`badge badge-${match.status}`}>{match.status}</span>
                  </div>
                </div>
 
                {/* ── NEW: Set as Live Match button ── */}
                {match.isCricket && (
                  <div className="am-live-control">
                    {activeMatchId === match._id ? (
                      <div className="live-active-row">
                        <span className="live-active-badge">🔴 BOT ACTIVE — Receiving Live Scores</span>
                        <button className="btn btn-danger btn-sm" onClick={clearLiveMatch}>Stop</button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => setAsLiveMatch(match._id)}
                        disabled={liveLoading}
                      >
                        📡 Set as Live Match
                      </button>
                    )}
                  </div>
                )}
 
                {/* Score display */}
                {match.isCricket && match.score && (
                  <div className="am-score">
                    <span>{match.teamA}: {match.score.teamA?.runs}/{match.score.teamA?.wickets} ({match.score.teamA?.overs} ov)</span>
                    <span className="score-sep">|</span>
                    <span>{match.teamB}: {match.score.teamB?.runs}/{match.score.teamB?.wickets} ({match.score.teamB?.overs} ov)</span>
                  </div>
                )}
 
                {/* Odds editing */}
                <div className="am-odds-row">
                  {editingOdds[match._id] ? (
                    <div className="odds-edit">
                      <input type="number" step="0.01" className="form-input odds-edit-input" value={editingOdds[match._id].oddsTeamA} onChange={e => setEditingOdds(prev => ({ ...prev, [match._id]: { ...prev[match._id], oddsTeamA: e.target.value } }))} />
                      <span className="odds-sep">vs</span>
                      <input type="number" step="0.01" className="form-input odds-edit-input" value={editingOdds[match._id].oddsTeamB} onChange={e => setEditingOdds(prev => ({ ...prev, [match._id]: { ...prev[match._id], oddsTeamB: e.target.value } }))} />
                      <button className="btn btn-success btn-sm" onClick={() => saveOdds(match._id)}>Save</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingOdds(prev => { const n = { ...prev }; delete n[match._id]; return n; })}>Cancel</button>
                    </div>
                  ) : (
                    <div className="odds-display-row">
                      <span className="odds-chip">{match.teamA}: <strong>{match.oddsTeamA}x</strong></span>
                      <span className="odds-chip">{match.teamB}: <strong>{match.oddsTeamB}x</strong></span>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingOdds(prev => ({ ...prev, [match._id]: { oddsTeamA: match.oddsTeamA, oddsTeamB: match.oddsTeamB } }))}>✏️ Edit Odds</button>
                    </div>
                  )}
                </div>
 
                {/* Status + Winner actions */}
                <div className="am-actions">
                  <div className="action-group">
                    <span className="action-label">Status:</span>
                    {['upcoming', 'live', 'ended'].map(s => (
                      <button key={s} className={`btn btn-sm ${match.status === s ? 'btn-primary' : 'btn-ghost'}`} onClick={() => updateMatch(match._id, { status: s })} disabled={match.status === s}>{s}</button>
                    ))}
                  </div>
                  {match.status !== 'upcoming' && !match.result && (
                    <div className="action-group">
                      <span className="action-label">Winner:</span>
                      <button className="btn btn-sm btn-ghost" onClick={() => updateMatch(match._id, { result: 'teamA' })}>{match.teamA} ✅</button>
                      {match.oddsDraw && <button className="btn btn-sm btn-ghost" onClick={() => updateMatch(match._id, { result: 'draw' })}>Draw</button>}
                      <button className="btn btn-sm btn-ghost" onClick={() => updateMatch(match._id, { result: 'teamB' })}>{match.teamB} ✅</button>
                    </div>
                  )}
                  {match.result && <span className="result-declared">🏆 Winner: {match.result === 'teamA' ? match.teamA : match.result === 'teamB' ? match.teamB : 'Draw'}</span>}
                  <button className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }} onClick={() => deleteMatch(match._id)}>🗑</button>
                </div>
 
                {/* Sessions (cricket only) */}
                {match.isCricket && (
                  <div className="am-sessions">
                    <div className="sessions-header">
                      <span className="action-label">🏏 Session Markets</span>
                      {match.status !== 'ended' && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setSessionModal(match)}>+ Add Session</button>
                      )}
                    </div>
                    {match.sessions && match.sessions.length > 0 ? (
                      <div className="sessions-admin-list">
                        {match.sessions.map(session => (
                          <div key={session._id || session.sessionType} className={`session-admin-row ${session.result ? 'settled' : session.isOpen ? 'open' : 'closed'}`}>
                            <span className="session-admin-label">{session.label}</span>
                            {session.line && <span className="session-admin-line">Line: {session.line}</span>}
                            {session.actualScore && <span className="session-actual">Actual: {session.actualScore}</span>}
                            <span className={`session-status-dot ${session.result ? 'settled' : session.isOpen ? 'open' : 'closed'}`}>
                              {session.result ? `✅ ${session.result}` : session.isOpen ? '🟢 Open' : '🔴 Closed'}
                            </span>
                            {!session.result && session.isOpen && (
                              <>
                                <button className="btn btn-ghost btn-sm" onClick={() => { setSettleModal({ match, session }); setSettleValue(''); }}>Settle</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => closeSession(match._id, session.sessionType)}>Close</button>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : <div className="no-sessions">No sessions yet.</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
 
        {/* ── TRANSACTIONS ── */}
        {tab === 'transactions' && (
          <div className="admin-transactions">
            <div className="txn-filter-row">
              <h2 className="section-title">💳 Transaction Dashboard</h2>
              <span className="pending-count">{pendingTxns.length} pending</span>
            </div>
            {pendingTxns.length > 0 && (
              <div className="pending-requests-section">
                <div className="pending-section-title">⚡ Pending — Action Required</div>
                <div className="txn-list">
                  {pendingTxns.map(txn => (
                    <div key={txn._id} className="txn-admin-card card pending">
                      <div className="txn-admin-header">
                        <div className="txn-user-info">
                          <div className="txn-user-avatar">{txn.userId?.name?.charAt(0)}</div>
                          <div>
                            <div className="txn-user-name">{txn.userId?.name}</div>
                            <div className="txn-user-email">{txn.userId?.email}</div>
                            <div className="txn-user-balance">Balance: <strong>{txn.userId?.points?.toLocaleString()} pts</strong></div>
                          </div>
                        </div>
                        <div className="txn-details">
                          <div className={`txn-type ${txn.type}`}>{txn.type === 'deposit' ? '💰 Deposit' : '💸 Withdrawal'}</div>
                          <div className="txn-amount">{txn.points?.toLocaleString()} pts</div>
                          <div className="txn-date">{new Date(txn.createdAt).toLocaleString()}</div>
                          {txn.reference && <div className="txn-ref">Ref: {txn.reference}</div>}
                        </div>
                        <div className="txn-status-col">
                          <span className="result-badge pending">⏳ Pending</span>
                        </div>
                      </div>
                      <div className="txn-actions">
                        <button className="btn btn-success btn-sm" onClick={() => processTransaction(txn._id, 'approve')}>✅ Approve {txn.type === 'deposit' ? `(Add ${txn.points} pts)` : '(Confirm)'}</button>
                        <button className="btn btn-danger btn-sm" onClick={() => processTransaction(txn._id, 'reject', 'Rejected by admin')}>❌ Reject</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <TransactionStats transactions={transactions} />
          </div>
        )}
      </div>
 
      {/* Add Session Modal */}
      {sessionModal && (
        <div className="modal-overlay" onClick={() => setSessionModal(null)}>
          <div className="modal-box card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Add Session Market</div>
              <button className="modal-close" onClick={() => setSessionModal(null)}>✕</button>
            </div>
            <div className="admin-form" style={{ gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Session Type</label>
                <select className="form-input" value={newSession.sessionType} onChange={e => setNewSession({ ...newSession, sessionType: e.target.value })}>
                  <option value="">Select type...</option>
                  <option value="toss">Toss Winner</option>
                  <option value="over_6">6-Over Total</option>
                  <option value="over_10">10-Over Total</option>
                  <option value="over_15">15-Over Total</option>
                  <option value="over_20">20-Over Total</option>
                  <option value="next_over">Next Over Runs</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Label (shown to users)</label>
                <input className="form-input" value={newSession.label} onChange={e => setNewSession({ ...newSession, label: e.target.value })} placeholder="e.g. Runs in 6-Over Powerplay" />
              </div>
              {newSession.sessionType !== 'toss' && (
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Over/Under Line</label>
                    <input type="number" step="0.5" className="form-input" value={newSession.line} onChange={e => setNewSession({ ...newSession, line: e.target.value })} placeholder="e.g. 48.5" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Odds Over</label>
                    <input type="number" step="0.01" className="form-input" value={newSession.oddsOver} onChange={e => setNewSession({ ...newSession, oddsOver: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Odds Under</label>
                    <input type="number" step="0.01" className="form-input" value={newSession.oddsUnder} onChange={e => setNewSession({ ...newSession, oddsUnder: e.target.value })} />
                  </div>
                </div>
              )}
              {newSession.sessionType === 'toss' && (
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Odds {sessionModal.teamA}</label>
                    <input type="number" step="0.01" className="form-input" value={newSession.oddsTeamA} onChange={e => setNewSession({ ...newSession, oddsTeamA: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Odds {sessionModal.teamB}</label>
                    <input type="number" step="0.01" className="form-input" value={newSession.oddsTeamB} onChange={e => setNewSession({ ...newSession, oddsTeamB: e.target.value })} />
                  </div>
                </div>
              )}
              <button className="btn btn-primary" onClick={() => addSession(sessionModal._id)}>Add Session</button>
            </div>
          </div>
        </div>
      )}
 
      {/* Settle Session Modal */}
      {settleModal && (
        <div className="modal-overlay" onClick={() => setSettleModal(null)}>
          <div className="modal-box card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Settle: {settleModal.session.label}</div>
              <button className="modal-close" onClick={() => setSettleModal(null)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {settleModal.session.sessionType === 'toss' ? (
                <>
                  <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Who won the toss?</p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className={`btn btn-lg ${settleValue === 'teamA' ? 'btn-primary' : 'btn-ghost'}`} style={{ flex: 1 }} onClick={() => setSettleValue('teamA')}>{settleModal.match.teamA}</button>
                    <button className={`btn btn-lg ${settleValue === 'teamB' ? 'btn-primary' : 'btn-ghost'}`} style={{ flex: 1 }} onClick={() => setSettleValue('teamB')}>{settleModal.match.teamB}</button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Line was <strong>{settleModal.session.line}</strong>. What was the actual result?</p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className={`btn btn-lg ${settleValue === 'over' ? 'btn-success' : 'btn-ghost'}`} style={{ flex: 1 }} onClick={() => setSettleValue('over')}>Over {settleModal.session.line}</button>
                    <button className={`btn btn-lg ${settleValue === 'under' ? 'btn-danger' : 'btn-ghost'}`} style={{ flex: 1 }} onClick={() => setSettleValue('under')}>Under {settleModal.session.line}</button>
                  </div>
                </>
              )}
              <button className="btn btn-primary btn-lg" onClick={settleSession} disabled={!settleValue}>Confirm & Settle Bets</button>
            </div>
          </div>
        </div>
      )}
 
      {toast && <div className={`toast alert alert-${toast.type === 'error' ? 'error' : 'success'}`}>{toast.msg}</div>}
    </div>
  );
};
 
export default Admin;
