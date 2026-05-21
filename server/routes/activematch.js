const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Match = require('../models/Match');
 
// ── ActiveMatch schema ───────────────────────────────────────────────────────
const activeMatchSchema = new mongoose.Schema({
  matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match' },
  updatedAt: { type: Date, default: Date.now }
});
const ActiveMatch = mongoose.models.ActiveMatch || mongoose.model('ActiveMatch', activeMatchSchema);
 
// ── Bot auth ─────────────────────────────────────────────────────────────────
function botAuth(req, res, next) {
  const secret = req.headers['x-bot-secret'] || req.body.secret;
  if (secret !== process.env.BOT_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
 
// ── Score parser ─────────────────────────────────────────────────────────────
function parseScore(text) {
  const result = {
    rawText: text, runs: null, wickets: null,
    overs: null, overNumber: null, ballNumber: null,
    runRate: null, currentBatsman: null, eventType: 'ball'
  };
  const t = text.toUpperCase();
 
  if (t.includes('SIXX') || t.includes('SIX!!!')) result.eventType = 'six';
  else if (t.includes('FOURR') || t.includes('FOUR!!!')) result.eventType = 'four';
  else if (t.includes('WKT') || t.includes('WICKET') || t.includes('BOWLED') ||
    t.includes('CAUGHT') || t.includes('LBW')) result.eventType = 'wicket';
  else if (t.match(/\d+\s+OVER\s+\d+\/\d/i)) result.eventType = 'over_end';
 
  // over.ball score/wickets e.g. "9.1  61/4"
  const overBallMatch = text.match(/(\d{1,2})\.(\d)\s+(\d+)\/(\d)/);
  if (overBallMatch) {
    result.overNumber = parseInt(overBallMatch[1]);
    result.ballNumber = parseInt(overBallMatch[2]);
    result.overs = `${overBallMatch[1]}.${overBallMatch[2]}`;
    result.runs = parseInt(overBallMatch[3]);
    result.wickets = parseInt(overBallMatch[4]);
  }
 
  // End of over e.g. "15 OVER 94/5"
  const overEndMatch = text.match(/(\d+)\s+OVER\s+(\d+)\/(\d)/i);
  if (overEndMatch) {
    result.overNumber = parseInt(overEndMatch[1]);
    result.runs = parseInt(overEndMatch[2]);
    result.wickets = parseInt(overEndMatch[3]);
    result.overs = `${overEndMatch[1]}.6`;
    result.eventType = 'over_end';
  }
 
  // Standalone score e.g. "61/4"
  if (result.runs === null) {
    const scoreMatch = text.match(/(\d+)\/(\d)/);
    if (scoreMatch) { result.runs = parseInt(scoreMatch[1]); result.wickets = parseInt(scoreMatch[2]); }
  }
 
  // Run rate
  const rrMatch = text.match(/RUN RATE.*?(\d+\.\d+)/i);
  if (rrMatch) result.runRate = parseFloat(rrMatch[1]);
 
  // Batsman on strike
  const batsmanMatch = text.match(/([A-Z][A-Z\s\-]+)\s+ON STRIKE/i);
  if (batsmanMatch) result.currentBatsman = batsmanMatch[1].trim();
 
  return result;
}
 
// ── Odds calculator ──────────────────────────────────────────────────────────
function calculateLiveOdds(scoreData) {
  const { runs, wickets, overNumber } = scoreData;
  if (runs === null || !overNumber || overNumber === 0) return null;
 
  const PAR_SCORE = 160;
  const TOTAL_OVERS = 20;
  const oversLeft = TOTAL_OVERS - overNumber;
  const currentRR = runs / overNumber;
  const projected = runs + (currentRR * oversLeft) - (wickets * 8);
 
  let prob = Math.min(0.85, Math.max(0.15, projected / (PAR_SCORE * 2)));
  const MARGIN = 0.95;
  return {
    battingOdds: parseFloat((MARGIN / prob).toFixed(2)),
    bowlingOdds: parseFloat((MARGIN / (1 - prob)).toFixed(2))
  };
}
 
// ── Auto-settle sessions ─────────────────────────────────────────────────────
async function autoSettleSessions(match, overNumber, actualRuns, io) {
  if (!match.sessions) return;
  const overMap = { over_6: 6, over_10: 10, over_15: 15, over_20: 20 };
  let changed = false;
 
  for (const session of match.sessions) {
    if (session.result || !session.isOpen) continue;
    const sessionOver = overMap[session.sessionType];
    if (!sessionOver || overNumber < sessionOver) continue;
 
    session.result = actualRuns > session.line ? 'over' : 'under';
    session.settled = true;
    session.settledAt = new Date();
    session.actualScore = actualRuns;
    session.isOpen = false;
    changed = true;
    console.log(`✅ Auto-settled: ${session.label} | Line: ${session.line} | Score: ${actualRuns} | Result: ${session.result}`);
  }
 
  if (!changed) return;
  await match.save();
 
  // Pay out winners
  try {
    const SessionBet = mongoose.models.SessionBet;
    const User = mongoose.models.User;
    if (SessionBet && User) {
      for (const session of match.sessions) {
        if (!session.settled || !session.result) continue;
        const bets = await SessionBet.find({ matchId: match._id, sessionType: session.sessionType, status: 'active' });
        for (const bet of bets) {
          const won = bet.prediction === session.result;
          bet.status = won ? 'won' : 'lost';
          bet.settledAt = new Date();
          if (won) await User.findByIdAndUpdate(bet.userId, { $inc: { points: Math.floor(bet.pointsBet * bet.oddsAtTime) } });
          await bet.save();
        }
      }
    }
  } catch (err) { console.error('Payout error:', err.message); }
 
  if (io) io.emit('sessionSettled', { matchId: match._id, sessions: match.sessions });
}
 
// ════════════════════════════════════════════════════════════════════════════
// ROUTES
// ════════════════════════════════════════════════════════════════════════════
 
// GET /api/activematch — bot calls this to get current live match
router.get('/', async (req, res) => {
  try {
    const active = await ActiveMatch.findOne().sort({ updatedAt: -1 });
    res.json({ matchId: active?.matchId || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
 
// POST /api/activematch/set — admin sets which match is live
router.post('/set', async (req, res) => {
  try {
    const { matchId } = req.body;
    await ActiveMatch.deleteMany({});
    const active = await ActiveMatch.create({ matchId });
    await Match.findByIdAndUpdate(matchId, { status: 'live' });
    const io = req.app.get('io');
    if (io) io.emit('activematchChanged', { matchId });
    res.json({ success: true, active });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
 
// POST /api/activematch/clear — admin clears active match
router.post('/clear', async (req, res) => {
  try {
    await ActiveMatch.deleteMany({});
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
 
// POST /api/activematch/livescore — bot posts every score update here
router.post('/livescore', botAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'No text' });
 
    const active = await ActiveMatch.findOne().sort({ updatedAt: -1 });
    if (!active?.matchId) return res.json({ skipped: true, reason: 'No active match' });
 
    const match = await Match.findById(active.matchId);
    if (!match) return res.json({ skipped: true, reason: 'Match not found' });
 
    const scoreData = parseScore(text);
 
    // Update score
    if (scoreData.runs !== null) {
      if (!match.score) match.score = { teamA: {}, teamB: {} };
      match.score.teamA = {
        runs: scoreData.runs,
        wickets: scoreData.wickets || 0,
        overs: scoreData.overs || match.score.teamA?.overs || '0.0'
      };
      match.lastBall = scoreData.rawText;
      if (scoreData.currentBatsman) match.currentBatsman = scoreData.currentBatsman;
      if (scoreData.runRate) match.runRate = scoreData.runRate;
      match.markModified('score');
    }
 
    const io = req.app.get('io');
 
    // Recalculate odds
    if (scoreData.runs !== null && scoreData.overNumber > 0) {
      const newOdds = calculateLiveOdds(scoreData);
      if (newOdds) {
        match.oddsTeamA = newOdds.battingOdds;
        match.oddsTeamB = newOdds.bowlingOdds;
        if (io) io.emit('oddsUpdated', { matchId: match._id, oddsTeamA: match.oddsTeamA, oddsTeamB: match.oddsTeamB });
      }
    }
 
    await match.save();
 
    if (io) {
      io.emit('liveScore', { matchId: match._id, scoreData, score: match.score, runRate: match.runRate, lastBall: match.lastBall });
      io.emit('matchUpdated', match);
    }
 
    // Auto-settle sessions when an over ends
    if (scoreData.eventType === 'over_end' && scoreData.overNumber && scoreData.runs !== null) {
      await autoSettleSessions(match, scoreData.overNumber, scoreData.runs, io);
    }
 
    res.json({ success: true, scoreData });
  } catch (err) {
    console.error('Livescore error:', err);
    res.status(500).json({ error: err.message });
  }
});
 
// POST /api/activematch/cashout — user cashes out their match bet
router.post('/cashout', async (req, res) => {
  try {
    const { betId, userId } = req.body;
    const Bet = mongoose.models.Bet;
    const User = mongoose.models.User;
    if (!Bet || !User) return res.status(500).json({ error: 'Models not loaded' });
 
    const bet = await Bet.findById(betId);
    if (!bet) return res.status(404).json({ error: 'Bet not found' });
    if (bet.userId.toString() !== userId.toString()) return res.status(403).json({ error: 'Forbidden' });
    if (bet.status !== 'active') return res.status(400).json({ error: 'Bet already settled' });
 
    const match = await Match.findById(bet.matchId);
    if (!match) return res.status(404).json({ error: 'Match not found' });
 
    const currentOdds = bet.selectedTeam === 'teamA' ? match.oddsTeamA : match.oddsTeamB;
 
    // Industry cashout formula: (stake × originalOdds) / currentOdds × 0.90
    const cashoutValue = Math.floor((bet.pointsBet * bet.oddsAtTime) / currentOdds * 0.90);
 
    bet.status = 'cashout';
    bet.cashoutValue = cashoutValue;
    bet.settledAt = new Date();
    await bet.save();
 
    const updatedUser = await User.findByIdAndUpdate(userId, { $inc: { points: cashoutValue } }, { new: true });
 
    res.json({ success: true, cashoutValue, newPoints: updatedUser.points });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
 
module.exports = router;
 
