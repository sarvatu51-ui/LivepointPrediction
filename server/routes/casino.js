const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const CasinoBet = require('../models/CasinoBet');

// Used by ALL games after result
router.post('/play', protect, async (req, res) => {
  try {
    const { game, stake, multiplier, result } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.points < stake) return res.status(400).json({ message: 'Insufficient points' });

    user.points -= stake;
    let payout = 0;
    if (result === 'won') {
      payout = Math.floor(stake * multiplier);
      user.points += payout;
      user.totalWins = (user.totalWins || 0) + 1;
      user.totalPointsWon = (user.totalPointsWon || 0) + (payout - stake);
    } else {
      user.totalLosses = (user.totalLosses || 0) + 1;
      user.totalPointsLost = (user.totalPointsLost || 0) + stake;
    }
    await user.save();

    try {
      await CasinoBet.create({
        userId: user._id, game, stake, payout, multiplier, result,
        nonce: Date.now(), clientSeed: 'client', serverSeedHash: 'hash', serverSeed: 'seed'
      });
    } catch (e) { console.log('Bet log error:', e.message); }

    res.json({ success: true, newPoints: user.points, payout, result });
  } catch (error) {
    console.error('Casino play error:', error.message);
    res.status(500).json({ message: error.message });
  }
});

// Used by Mines only — deducts stake at game start
router.post('/mines/start', protect, async (req, res) => {
  try {
    const { stake, mineCount } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.points < stake) return res.status(400).json({ message: 'Insufficient points' });

    user.points -= stake;
    await user.save();

    // Generate mine positions server-side
    const positions = new Set();
    while (positions.size < mineCount) positions.add(Math.floor(Math.random() * 25));

    res.json({ success: true, newPoints: user.points, mines: [...positions] });
  } catch (error) {
    console.error('Mines start error:', error.message);
    res.status(500).json({ message: error.message });
  }
});

// Mines cashout — adds winnings (stake already deducted at start)
router.post('/mines/cashout', protect, async (req, res) => {
  try {
    const { stake, multiplier } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const payout = Math.floor(stake * multiplier);
    user.points += payout;
    user.totalWins = (user.totalWins || 0) + 1;
    user.totalPointsWon = (user.totalPointsWon || 0) + (payout - stake);
    await user.save();

    try {
      await CasinoBet.create({
        userId: user._id, game: 'mines', stake, payout, multiplier, result: 'won',
        nonce: Date.now(), clientSeed: 'client', serverSeedHash: 'hash', serverSeed: 'seed'
      });
    } catch (e) { console.log('Bet log error:', e.message); }

    res.json({ success: true, newPoints: user.points, payout });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/history', protect, async (req, res) => {
  try {
    const bets = await CasinoBet.find({ userId: req.user._id })
      .sort({ createdAt: -1 }).limit(50);
    res.json(bets);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
