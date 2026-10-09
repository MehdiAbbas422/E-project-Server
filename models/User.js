const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'exhibitor', 'attendee'], default: 'attendee' },
  isVerified: { type: Boolean, default: false },
  // Admins can block abusive accounts; blocked users cannot log in
  blocked: { type: Boolean, default: false }
}, { timestamps: true })

module.exports = mongoose.model('User', userSchema)
