const mongoose = require('mongoose')

const sessionSchema = new mongoose.Schema({
  expo: { type: mongoose.Schema.Types.ObjectId, ref: 'Expo', required: true },
  title: { type: String, required: true },
  speaker: { type: String, default: '' },
  topic: { type: String, default: '' },
  // Location label (hall/room or address)
  location: { type: String, default: '' },
  // Optional map pin coordinates for the session location
  lat: { type: Number, default: null },
  lng: { type: Number, default: null },
  // Optional seat limit (0/null means unlimited)
  capacity: { type: Number, default: 0 },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true }
}, { timestamps: true })

module.exports = mongoose.model('Session', sessionSchema)
