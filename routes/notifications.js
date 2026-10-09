const router = require('express').Router()
const Notification = require('../models/Notification')
const { auth } = require('../middleware/auth')

// GET /api/notifications
// Purpose: Returns the logged-in user's latest notifications (newest first)
// for the navbar bell, together with the unread count.
router.get('/', auth, async (req, res) => {
  const notifications = await Notification.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(50)
  const unread = await Notification.countDocuments({ user: req.user.id, read: false })
  res.json({ notifications, unread })
})

// GET /api/notifications/unread-count
// Purpose: Lightweight endpoint used to poll/refresh the unread bell badge.
router.get('/unread-count', auth, async (req, res) => {
  res.json({ unread: await Notification.countDocuments({ user: req.user.id, read: false }) })
})

// PATCH /api/notifications/read-all
// Purpose: Marks every notification of the current user as read.
router.patch('/read-all', auth, async (req, res) => {
  await Notification.updateMany({ user: req.user.id, read: false }, { read: true })
  res.json({ message: 'All notifications marked as read' })
})

// PATCH /api/notifications/:id/read
// Purpose: Marks one of the current user's notifications as read.
router.patch('/:id/read', auth, async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user.id },
    { read: true },
    { new: true }
  )
  if (!notification) return res.status(404).json({ message: 'Notification not found' })
  res.json(notification)
})

// DELETE /api/notifications
// Purpose: Clears the whole notification list of the current user.
router.delete('/', auth, async (req, res) => {
  await Notification.deleteMany({ user: req.user.id })
  res.json({ message: 'Notifications cleared' })
})

// DELETE /api/notifications/:id
// Purpose: Deletes a single notification that belongs to the current user.
router.delete('/:id', auth, async (req, res) => {
  const notification = await Notification.findOneAndDelete({ _id: req.params.id, user: req.user.id })
  if (!notification) return res.status(404).json({ message: 'Notification not found' })
  res.json({ message: 'Notification deleted' })
})

module.exports = router
