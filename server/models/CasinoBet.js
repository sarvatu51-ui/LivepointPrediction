const mongoose = require('mongoose');

const casinoBetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  game: {
    type: String,
    enum: ['aviator', 'mines', 'teen_patti', 'color_prediction', 'color_predict'],
    required: true
  },
  stake: { type: Number, required: true, min: 1 },
  payout: { type: Number, required: true, min: 0 },
  multiplier: { type: Number, required: true, min: 0 },
  result: { type: String, enum: ['won', 'lost'], required: true },
  nonce: { type: Number, default: 0 },
  clientSeed: { type: String, default: 'default' },
  serverSeedHash: { type: String, default: 'hash' },
  serverSeed: { type: String, default: 'seed' }
}, { timestamps: true });

module.exports = mongoose.model('CasinoBet', casinoBetSchema);
