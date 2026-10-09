const mongoose = require('mongoose')

// Direct enquiry sent by an attendee to an exhibitor (two-way communication)
const enquirySchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  exhibitor: { type: mongoose.Schema.Types.ObjectId, ref: 'Exhibitor', required: true },
  expo: { type: mongoose.Schema.Types.ObjectId, ref: 'Expo', default: null },
  message: { type: String, required: true },
  reply: { type: String, default: '' },
  repliedAt: { type: Date, default: null },
  status: { type: String, enum: ['open', 'replied'], default: 'open' }
}, { timestamps: true })

module.exports = mongoose.model('Enquiry', enquirySchema)
