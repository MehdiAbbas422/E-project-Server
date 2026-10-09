const mongoose = require('mongoose')

// A place in line for a full session; promoted to a booking when a seat frees up
const waitlistSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  expo: { type: mongoose.Schema.Types.ObjectId, ref: 'Expo', required: true }
}, { timestamps: true })

waitlistSchema.index({ user: 1, session: 1 }, { unique: true })

module.exports = mongoose.model('Waitlist', waitlistSchema)
