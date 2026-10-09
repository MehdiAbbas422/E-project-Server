const router = require('express').Router()
const Announcement = require('../models/Announcement')
const Booking = require('../models/Booking')
const Exhibitor = require('../models/Exhibitor')
const { auth, allow } = require('../middleware/auth')
const { notify, emitChange } = require('../utils/notify')

// GET /api/announcements?expo=<id>
// Purpose: Returns organizer announcements for an expo (or all if no expo id),
// newest first, for the announcement board on the expo page.
router.get('/', auth, async (req, res) => {
  const query = req.query.expo ? { expo: req.query.expo } : {}
  res.json(await Announcement.find(query).populate('author', 'name').sort({ createdAt: -1 }))
})

// POST /api/announcements
// Purpose: Admin-only broadcast — posts an announcement for an expo, sends a
// live in-app notification to everyone following that expo (booked attendees
// and approved exhibitors) and refreshes open pages in real time.
router.post('/', auth, allow('admin'), async (req, res) => {
  const { expo, title, message } = req.body
  if (!expo || !title || !message)
    return res.status(400).json({ message: 'Expo, title and message are required' })

  const announcement = await Announcement.create({ expo, title, message, author: req.user.id })
  const io = req.app.get('io')

  const bookings = await Booking.find({ expo }).distinct('user')
  const exhibitors = await Exhibitor.find({ expo, status: 'approved' }).distinct('user')
  const audience = [...new Set([...bookings, ...exhibitors].map(String))]

  await Promise.all(
    audience.map((userId) => notify(io, userId, {
      title: `📣 ${title}`,
      message,
      type: 'announcement',
      link: `/expos/${expo}`
    }))
  )

  emitChange(io, 'announcements', { expoId: expo })
  res.status(201).json(announcement)
})

// DELETE /api/announcements/:id
// Purpose: Admin-only removal of an announcement.
router.delete('/:id', auth, allow('admin'), async (req, res) => {
  const announcement = await Announcement.findByIdAndDelete(req.params.id)
  if (!announcement) return res.status(404).json({ message: 'Announcement not found' })
  emitChange(req.app.get('io'), 'announcements', { expoId: announcement.expo })
  res.json({ message: 'Announcement deleted' })
})

module.exports = router
