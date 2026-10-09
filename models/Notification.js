const mongoose = require('mongoose')

// In-app notification delivered to one user (bell icon in the navbar)
const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  message: { type: String, default: '' },
  type: {
    type: String,
    enum: ['booth', 'booking', 'exhibitor', 'announcement', 'feedback', 'enquiry', 'system'],
    default: 'system'
  },
  // Optional client route to open when the notification is clicked
  link: { type: String, default: '' },
  read: { type: Boolean, default: false }
}, { timestamps: true })

module.exports = mongoose.model('Notification', notificationSchema)
