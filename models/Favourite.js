const mongoose = require('mongoose')

// A bookmarked / saved expo for an attendee
const favouriteSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expo: { type: mongoose.Schema.Types.ObjectId, ref: 'Expo', required: true }
}, { timestamps: true })

favouriteSchema.index({ user: 1, expo: 1 }, { unique: true })

module.exports = mongoose.model('Favourite', favouriteSchema)
