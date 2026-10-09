const mongoose = require('mongoose')

const bookingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expo: { type: mongoose.Schema.Types.ObjectId, ref: 'Expo', required: true },
  session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', default: null }
}, { timestamps: true })

module.exports = mongoose.model('Booking', bookingSchema)
