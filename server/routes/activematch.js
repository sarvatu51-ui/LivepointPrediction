const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Match = require('../models/Match');
 
// ── ActiveMatch schema ───────────────────────────────────────────────────────
const activeMatchSchema = new mongoose.Schema({
  matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match' },
  battingTeam: { type: String, default: 'teamA' }, // ← NEW: tracks which team is batting
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

  // Skip betting odds format e.g. "57-8 6 OVER" or "67 KA 90/11 6 OVER"
  if (t.match(/\d+\s*KA\s*\d+/) || t.match(/\d+-\d+\s+\d+\s+OVER/)) return result;
 
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
function calculateLiveOdds(scoreData, battingTeam, match) {
  const { runs, wickets, overNumber } = scoreData;
  if (runs === null || !overNumber || overNumber === 0) return null;
 
  const TOTAL_OVERS = 20;
  const MARGIN = 0.95;

  if (battingTeam === 'teamA') {
    // First innings — project final score
    const PAR_SCORE = 160;
    const oversLeft = TOTAL_OVERS - overNumber;
    const currentRR = runs / overNumber;
    const projected = runs + (currentRR * oversLeft) - (wickets * 8);
    let prob = Math.min(0.85, Math.max(0.15, projected / (PAR_SCORE * 2)));
    return {
      battingOdds: parseFloat((MARGIN / prob).toFixed(2)),
      bowlingOdds: parseFloat((MARGIN / (1 - prob)).toFixed(2))
    };
  } else {
    // Second innings — chase odds based on target
    const target = (match.score?.teamA?.runs || 0) + 1;
    if (!target || target <= 0) return null;
    const runsNeeded = target - runs;
    const ballsLeft = (TOTAL_OVERS * 6) - (overNumber * 6 + (scoreData.ballNumber || 0));
    if (ballsLeft <= 0) return null;
    const requiredRR = (runsNeeded / ballsLeft) * 6;
    const currentRR = overNumber > 0 ? (runs / overNumber) : 0;
    // Higher required RR means chasing team less likely to win
    let chaseProb = Math.min(0.85, Math.max(0.15, currentRR / (currentRR + requiredRR)));
    // Also factor in wickets lost
    chaseProb = chaseProb * (1 - (wickets * 0.05));
    chaseProb = Math.min(0.85, Math.max(0.15, chaseProb));
    return {
      battingOdds: parseFloat((MARGIN / chaseProb).toFixed(2)),      // chasing team odds
      bowlingOdds: parseFloat((MARGIN / (1 - chaseProb)).toFixed(2)) // defending team odds
    };
  }
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
 
// GET /api/activematch
router.get('/', async (req, res) => {
  try {
    const active = await ActiveMatch.findOne().sort({ updatedAt: -1 });
    res.json({ matchId: active?.matchId || null, battingTeam: active?.battingTeam || 'teamA' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
 
// POST /api/activematch/set
router.post('/set', async (req, res) => {
  try {
    const { matchId } = req.body;
    await ActiveMatch.deleteMany({});
    const active = await ActiveMatch.create({ matchId, battingTeam: 'teamA' });
    await Match.findByIdAndUpdate(matchId, { status: 'live' });
    const io = req.app.get('io');
    if (io) io.emit('activematchChanged', { matchId });
    res.json({ success: true, active });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/activematch/switchinnings — admin switches to second innings
router.post('/switchinnings', async (req, res) => {
  try {
    const active = await ActiveMatch.findOne().sort({ updatedAt: -1 });
    if (!active) return res.status(404).json({ error: 'No active match' });
    const newBattingTeam = active.battingTeam === 'teamA' ? 'teamB' : 'teamA';
    active.battingTeam = newBattingTeam;
    await active.save();
    console.log(`🔄 Innings switched → ${newBattingTeam} is now batting`);
    res.json({ success: true, battingTeam: newBattingTeam });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
 
// POST /api/activematch/clear
router.post('/clear', async (req, res) => {
  try {
    await ActiveMatch.deleteMany({});
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
 
// POST /api/activematch/livescore
router.post('/livescore', botAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'No text' });
 
    const active = await ActiveMatch.findOne().sort({ updatedAt: -1 });
    if (!active?.matchId) return res.json({ skipped: true, reason: 'No active match' });
 
    const match = await Match.findById(active.matchId);
    if (!match) return res.json({ skipped: true, reason: 'Match not found' });

    const battingTeam = active.battingTeam || 'teamA';
    const scoreData = parseScore(text);
 
    // Update score for the correct batting team
    if (scoreData.runs !== null) {
      if (!match.score) match.score = { teamA: {}, teamB: {} };
      match.score[battingTeam] = {
        runs: scoreData.runs,
        wickets: scoreData.wickets || 0,
        overs: scoreData.overs || match.score[battingTeam]?.overs || '0.0'
      };
      match.lastBall = scoreData.rawText;
      if (scoreData.currentBatsman) match.currentBatsman = scoreData.currentBatsman;
      if (scoreData.runRate) match.runRate = scoreData.runRate;
      match.markModified('score');
    }
 
    const io = req.app.get('io');
 
    // Recalculate odds
    if (scoreData.runs !== null && scoreData.overNumber > 0) {
      const newOdds = calculateLiveOdds(scoreData, battingTeam, match);
      if (newOdds) {
        if (battingTeam === 'teamA') {
          match.oddsTeamA = newOdds.battingOdds;
          match.oddsTeamB = newOdds.bowlingOdds;
        } else {
          // In 2nd innings teamB is chasing so flip odds correctly
          match.oddsTeamB = newOdds.battingOdds;
          match.oddsTeamA = newOdds.bowlingOdds;
        }
        if (io) io.emit('oddsUpdated', { matchId: match._id, oddsTeamA: match.oddsTeamA, oddsTeamB: match.oddsTeamB });
      }
    }
 
    await match.save();
 
    if (io) {
      io.emit('liveScore', { matchId: match._id, scoreData, score: match.score, runRate: match.runRate, lastBall: match.lastBall });
      io.emit('matchUpdated', match);
    }
 
    if (scoreData.eventType === 'over_end' && scoreData.overNumber && scoreData.runs !== null) {
      await autoSettleSessions(match, scoreData.overNumber, scoreData.runs, io);
    }
 
    res.json({ success: true, scoreData, battingTeam });
  } catch (err) {
    console.error('Livescore error:', err);
    res.status(500).json({ error: err.message });
  }
});
 
// POST /api/activematch/cashout
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
