const mongoose = require('mongoose')

const exhibitorSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expo: { type: mongoose.Schema.Types.ObjectId, ref: 'Expo', required: true },
  company: { type: String, required: true },
  description: { type: String, default: '' },
  products: { type: String, default: '' },
  logo: { type: String, default: '' },
  contact: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }
}, { timestamps: true })

exhibitorSchema.index({ user: 1, expo: 1 }, { unique: true })

module.exports = mongoose.model('Exhibitor', exhibitorSchema)
