const mongoose = require('mongoose')

// Organizer announcement broadcast to an expo audience
const announcementSchema = new mongoose.Schema({
  expo: { type: mongoose.Schema.Types.ObjectId, ref: 'Expo', required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  message: { type: String, required: true }
}, { timestamps: true })

module.exports = mongoose.model('Announcement', announcementSchema)
