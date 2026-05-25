const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');

let CasinoBet;
try { CasinoBet = require('../models/CasinoBet'); } catch (e) { CasinoBet = null; }

// ✅ POST /api/casino/play — handles ALL games win/loss
router.post('/play', protect, async (req, res) => {
  try {
    const { game, stake, multiplier, result } = req.body;
    const userId = req.user._id;

    if (!stake || stake < 1) return res.status(400).json({ message: 'Invalid stake' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // For non-mines games: check if enough points (mines deducts upfront via /mines/start)
    if (game !== 'mines_cashout') {
      if (user.points < stake) return res.status(400).json({ message: 'Not enough points' });
    }

    let payout = 0;
    let pointsChange = 0;

    if (result === 'won') {
      payout = Math.floor(stake * multiplier);
      pointsChange = payout - stake; // net gain
      user.totalWins = (user.totalWins || 0) + 1;
      user.totalPointsWon = (user.totalPointsWon || 0) + payout;
      user.points = user.points - stake + payout; // deduct stake, add full payout
    } else {
      pointsChange = -stake;
      payout = 0;
      user.totalLosses = (user.totalLosses || 0) + 1;
      user.totalPointsLost = (user.totalPointsLost || 0) + stake;
      user.points = user.points - stake;
    }

    if (user.points < 0) user.points = 0;
    await user.save();

    // Save bet record
    if (CasinoBet) {
      try {
        await CasinoBet.create({
          userId,
          game: game || 'unknown',
          stake,
          payout,
          multiplier: multiplier || 0,
          result,
          nonce: Date.now(),
          clientSeed: 'client',
          serverSeedHash: 'hash',
          serverSeed: 'seed'
        });
      } catch (e) { /* non-fatal */ }
    }

    console.log(`✅ Casino [${game}] ${user.email} | stake:${stake} result:${result} payout:${payout} | balance:${user.points}`);

    res.json({ success: true, newPoints: user.points, pointsChange, payout, result });
  } catch (err) {
    console.error('Casino play error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ✅ POST /api/casino/mines/start — deduct stake upfront
router.post('/mines/start', protect, async (req, res) => {
  try {
    const { stake, mineCount } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.points < stake) return res.status(400).json({ message: 'Not enough points' });

    user.points -= stake;
    await user.save();

    const positions = new Set();
    while (positions.size < Math.min(mineCount || 5, 24)) {
      positions.add(Math.floor(Math.random() * 25));
    }

    res.json({ success: true, newPoints: user.points, mines: [...positions] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ POST /api/casino/mines/cashout — add winnings
router.post('/mines/cashout', protect, async (req, res) => {
  try {
    const { stake, multiplier } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const payout = Math.floor(stake * multiplier);
    user.points += payout;
    user.totalWins = (user.totalWins || 0) + 1;
    user.totalPointsWon = (user.totalPointsWon || 0) + payout;
    await user.save();

    if (CasinoBet) {
      try {
        await CasinoBet.create({
          userId: req.user._id, game: 'mines', stake, payout,
          multiplier, result: 'won', nonce: Date.now(),
          clientSeed: 'client', serverSeedHash: 'hash', serverSeed: 'seed'
        });
      } catch (e) { /* non-fatal */ }
    }

    console.log(`✅ Mines cashout ${user.email} | stake:${stake} mult:${multiplier} payout:${payout} | balance:${user.points}`);
    res.json({ success: true, newPoints: user.points, payout });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ POST /api/casino/mines/bust — mine hit, no extra deduction (stake already taken)
router.post('/mines/bust', protect, async (req, res) => {
  try {
    const { stake } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.totalLosses = (user.totalLosses || 0) + 1;
    user.totalPointsLost = (user.totalPointsLost || 0) + stake;
    await user.save();

    if (CasinoBet) {
      try {
        await CasinoBet.create({
          userId: req.user._id, game: 'mines', stake, payout: 0,
          multiplier: 0, result: 'lost', nonce: Date.now(),
          clientSeed: 'client', serverSeedHash: 'hash', serverSeed: 'seed'
        });
      } catch (e) { /* non-fatal */ }
    }

    res.json({ success: true, newPoints: user.points });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/casino/history — bet history for wallet page
router.get('/history', protect, async (req, res) => {
  try {
    if (!CasinoBet) return res.json([]);
    const bets = await CasinoBet.find({ userId: req.user._id })
      .sort({ createdAt: -1 }).limit(100);
    res.json(bets);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/casino/stats
router.get('/stats', protect, async (req, res) => {
  try {
    if (!CasinoBet) return res.json({ totalBets: 0, totalWins: 0, totalLosses: 0, netProfit: 0 });
    const bets = await CasinoBet.find({ userId: req.user._id });
    res.json({
      totalBets: bets.length,
      totalWins: bets.filter(b => b.result === 'won').length,
      totalLosses: bets.filter(b => b.result === 'lost').length,
      totalStaked: bets.reduce((s, b) => s + b.stake, 0),
      totalPayout: bets.reduce((s, b) => s + b.payout, 0),
      netProfit: bets.reduce((s, b) => s + (b.payout - b.stake), 0),
      bestWin: Math.max(0, ...bets.filter(b => b.result === 'won').map(b => b.payout - b.stake))
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
