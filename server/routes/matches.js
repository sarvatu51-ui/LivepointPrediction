const express = require('express');
const router = express.Router();
const Match = require('../models/Match');
const Bet = require('../models/Bet');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');

// @route   GET /api/matches
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const matches = await Match.find(filter).sort({ createdAt: -1 });
    res.json(matches);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/matches/:id
router.get('/:id', async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ message: 'Match not found' });
    res.json(match);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/matches
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const match = await Match.create(req.body);
    const io = req.app.get('io');
    io.emit('matchCreated', match);
    res.status(201).json(match);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/matches/:id - handles ALL fields including sessions
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const {
      oddsTeamA, oddsTeamB, status, result, oddsDraw,
      sessions, score, tossWinner, tossDecision, cricApiMatchId
    } = req.body;

    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ message: 'Match not found' });

    // Track odds history if odds changed
    if (oddsTeamA || oddsTeamB) {
      match.oddsHistory.push({
        oddsTeamA: match.oddsTeamA,
        oddsTeamB: match.oddsTeamB
      });
    }

    // Update all fields
    if (oddsTeamA) match.oddsTeamA = oddsTeamA;
    if (oddsTeamB) match.oddsTeamB = oddsTeamB;
    if (oddsDraw !== undefined) match.oddsDraw = oddsDraw;
    if (status) match.status = status;
    if (tossWinner) match.tossWinner = tossWinner;
    if (tossDecision) match.tossDecision = tossDecision;
    if (cricApiMatchId) match.cricApiMatchId = cricApiMatchId;
    if (score) match.score = score;

    // ✅ Handle sessions update
    if (sessions !== undefined) {
      match.sessions = sessions;
    }

    // If result declared, settle all bets
    if (result && match.result !== result) {
      match.result = result;
      match.status = 'ended';
      await settleBets(match._id, result);
    }

    await match.save();

    const io = req.app.get('io');
    io.emit('matchUpdated', match);

    res.json(match);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/matches/:id
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    await Match.findByIdAndDelete(req.params.id);
    const io = req.app.get('io');
    io.emit('matchDeleted', { id: req.params.id });
    res.json({ message: 'Match deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Helper: Settle all bets when result declared
async function settleBets(matchId, result) {
  const bets = await Bet.find({ matchId, result: 'pending' });
  for (const bet of bets) {
    const won = bet.selectedTeam === result;
    if (won) {
      const winnings = Math.floor(bet.pointsBet * bet.oddsAtTime);
      const pointsChange = winnings - bet.pointsBet;
      await User.findByIdAndUpdate(bet.userId, {
        $inc: { points: winnings, totalWins: 1, totalPointsWon: pointsChange }
      });
      bet.result = 'won';
      bet.pointsChange = pointsChange;
    } else {
      await User.findByIdAndUpdate(bet.userId, {
        $inc: { totalLosses: 1, totalPointsLost: bet.pointsBet }
      });
      bet.result = 'lost';
      bet.pointsChange = -bet.pointsBet;
    }
    bet.settledAt = new Date();
    await bet.save();
  }
}
router.post('/:id/livescore', async (req, res) => {
  try {
    const { runs, wickets, over, runRate, rawText, botSecret } = req.body;
 
    // 🔒 Simple security check
    if (botSecret !== process.env.BOT_SECRET) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
 
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ message: 'Match not found' });
 
    // Update live score
    if (runs !== undefined && wickets !== undefined) {
      match.score.teamA.runs = runs;
      match.score.teamA.wickets = wickets;
      if (over) match.score.teamA.overs = over;
    }
 
    // Calculate live odds from score
    if (match.score.teamA.runs !== undefined) {
      const updatedOdds = calculateCricketOdds(match);
      match.oddsTeamA = updatedOdds.teamA;
      match.oddsTeamB = updatedOdds.teamB;
 
      // Save odds history
      match.oddsHistory.push({
        oddsTeamA: updatedOdds.teamA,
        oddsTeamB: updatedOdds.teamB
      });
    }
 
    await match.save();
 
    // 🔴 Emit live update to ALL users instantly via Socket.io
    const io = req.app.get('io');
    io.emit('oddsUpdated', {
      matchId: match._id,
      oddsTeamA: match.oddsTeamA,
      oddsTeamB: match.oddsTeamB,
      score: match.score,
      rawText: rawText
    });
 
    io.emit('matchUpdated', match);
 
    console.log(`✅ Live score updated: ${runs}/${wickets} over ${over}`);
    res.json({ success: true, match });
 
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
 
// 🧮 Calculate odds from live cricket score
function calculateCricketOdds(match) {
  const { runs, wickets, overs } = match.score.teamA;
 
  // Default 50/50
  let teamAProb = 50;
 
  // Adjust for wickets (more wickets = lower probability)
  teamAProb -= wickets * 4;
 
  // Adjust for run rate pressure
  if (overs > 0) {
    const currentRR = runs / overs;
    if (currentRR > 8) teamAProb += 10;
    else if (currentRR > 7) teamAProb += 5;
    else if (currentRR < 6) teamAProb -= 10;
    else if (currentRR < 7) teamAProb -= 5;
  }
 
  // Keep between 10% and 90%
  teamAProb = Math.min(90, Math.max(10, teamAProb));
  const teamBProb = 100 - teamAProb;
 
  return {
    teamA: parseFloat((100 / teamAProb).toFixed(2)),
    teamB: parseFloat((100 / teamBProb).toFixed(2))
  };
}
 
module.exports = router;
