const mongoose = require('mongoose')

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true },
  code: { type: String, required: true },
  purpose: { type: String, enum: ['verify', 'reset'], required: true },
  expiresAt: { type: Date, required: true }
}, { timestamps: true })

module.exports = mongoose.model('Otp', otpSchema)
