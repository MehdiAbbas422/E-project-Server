const mongoose = require('mongoose')

const feedbackSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ['suggestion', 'issue'], default: 'suggestion' },
  // Admin reply (two-way communication)
  reply: { type: String, default: '' },
  repliedAt: { type: Date, default: null },
  status: { type: String, enum: ['open', 'resolved'], default: 'open' }
}, { timestamps: true })

module.exports = mongoose.model('Feedback', feedbackSchema)
