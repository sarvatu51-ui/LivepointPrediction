const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const CasinoBet = require('../models/CasinoBet');

// POST /api/casino/play — generic play result (Aviator cash out, Mines, Teen Patti, Color)
router.post('/play', protect, async (req, res) => {
  try {
    const { game, stake, multiplier, result } = req.body;
    const userId = req.user._id;

    if (!stake || stake < 1) return res.status(400).json({ message: 'Invalid stake' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.points < stake) return res.status(400).json({ message: 'Not enough points' });

    let pointsChange = 0;
    if (result === 'won') {
      const winAmount = Math.floor(stake * multiplier);
      pointsChange = winAmount - stake;
      user.totalWins = (user.totalWins || 0) + 1;
      user.totalPointsWon = (user.totalPointsWon || 0) + winAmount;
    } else {
      pointsChange = -stake;
      user.totalLosses = (user.totalLosses || 0) + 1;
      user.totalPointsLost = (user.totalPointsLost || 0) + stake;
    }

    user.points += pointsChange;
    await user.save();

    // Save bet history
    try {
      await CasinoBet.create({
        userId,
        game,
        stake,
        payout: result === 'won' ? Math.floor(stake * multiplier) : 0,
        multiplier: multiplier || 0,
        result,
        nonce: Date.now(),
        clientSeed: 'client',
        serverSeedHash: 'hash',
        serverSeed: 'seed'
      });
    } catch (e) {
      console.log('CasinoBet save error (non-fatal):', e.message);
    }

    res.json({
      success: true,
      newPoints: user.points,
      pointsChange,
      result
    });
  } catch (error) {
    console.error('Casino play error:', error.message);
    res.status(500).json({ message: error.message });
  }
});

// POST /api/casino/mines/start — start a mines game (deduct stake)
router.post('/mines/start', protect, async (req, res) => {
  try {
    const { stake, mineCount } = req.body;
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.points < stake) return res.status(400).json({ message: 'Not enough points' });

    user.points -= stake;
    await user.save();

    // Generate mine positions server-side
    const positions = new Set();
    while (positions.size < (mineCount || 5)) {
      positions.add(Math.floor(Math.random() * 25));
    }

    res.json({
      success: true,
      newPoints: user.points,
      mines: [...positions]
    });
  } catch (error) {
    console.error('Mines start error:', error.message);
    res.status(500).json({ message: error.message });
  }
});

// GET /api/casino/history — user's casino bet history
router.get('/history', protect, async (req, res) => {
  try {
    const bets = await CasinoBet.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(bets);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/casino/stats — user's casino stats
router.get('/stats', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const bets = await CasinoBet.find({ userId });

    const stats = {
      totalBets: bets.length,
      totalWins: bets.filter(b => b.result === 'won').length,
      totalLosses: bets.filter(b => b.result === 'lost').length,
      totalStaked: bets.reduce((s, b) => s + b.stake, 0),
      totalPayout: bets.reduce((s, b) => s + b.payout, 0),
      netProfit: bets.reduce((s, b) => s + (b.payout - b.stake), 0),
      bestWin: bets.filter(b => b.result === 'won').reduce((max, b) => Math.max(max, b.payout - b.stake), 0),
      byGame: {}
    };

    ['aviator', 'mines', 'teen_patti', 'color_prediction'].forEach(game => {
      const gameBets = bets.filter(b => b.game === game);
      stats.byGame[game] = {
        bets: gameBets.length,
        wins: gameBets.filter(b => b.result === 'won').length,
        netProfit: gameBets.reduce((s, b) => s + (b.payout - b.stake), 0)
      };
    });

    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

