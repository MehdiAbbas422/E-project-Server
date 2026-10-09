const mongoose = require('mongoose')

const boothSchema = new mongoose.Schema({
  expo: { type: mongoose.Schema.Types.ObjectId, ref: 'Expo', required: true },
  number: { type: String, required: true },
  size: { type: String, default: 'Small' },
  status: { type: String, enum: ['available', 'reserved', 'occupied'], default: 'available' },
  exhibitor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true })

module.exports = mongoose.model('Booth', boothSchema)
