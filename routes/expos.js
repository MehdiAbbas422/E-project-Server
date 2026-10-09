const router = require('express').Router()
const Expo = require('../models/Expo')
const Booth = require('../models/Booth')
const Session = require('../models/Session')
const Booking = require('../models/Booking')
const Exhibitor = require('../models/Exhibitor')
const Announcement = require('../models/Announcement')
const Favourite = require('../models/Favourite')
const Waitlist = require('../models/Waitlist')
const { auth, allow } = require('../middleware/auth')
const { emitChange } = require('../utils/notify')
const { pick, escapeRegex } = require('../utils/validate')
const { getPagination, paginatedResponse } = require('../utils/paginate')
const { removeUpload } = require('../utils/files')

// Fields the client is allowed to set on an expo (mass-assignment protection)
const EXPO_FIELDS = ['title', 'date', 'location', 'lat', 'lng', 'image', 'description', 'theme']

// GET /api/expos
// Purpose: Public listing of every expo sorted by date so visitors can browse
// all expos and trade shows. Supports optional text search, an upcoming/past
// filter and optional pagination (`?page=&limit=`).
router.get('/', async (req, res) => {
  const { search, period } = req.query
  const query = {}
  if (search) {
    const safe = escapeRegex(search)
    query.$or = [
      { title: new RegExp(safe, 'i') },
      { theme: new RegExp(safe, 'i') },
      { location: new RegExp(safe, 'i') }
    ]
  }
  if (period === 'upcoming') query.date = { $gte: new Date() }
  if (period === 'past') query.date = { $lt: new Date() }

  const p = getPagination(req, 9)
  if (p) return res.json(await paginatedResponse(Expo, query, { sort: { date: 1 } }, p))
  res.json(await Expo.find(query).sort({ date: 1 }))
})

// GET /api/expos/:id
// Purpose: Returns a single expo (including its map coordinates) for the expo
// detail page; 404 if the id does not exist.
router.get('/:id', async (req, res) => {
  const expo = await Expo.findById(req.params.id)
  if (!expo) return res.status(404).json({ message: 'Expo not found' })
  res.json(expo)
})

// GET /api/expos/:id/bookings
// Purpose: Admin-only list of bookings for one expo (attendee + session) used
// by the dashboard and the CSV report export.
router.get('/:id/bookings', auth, allow('admin'), async (req, res) => {
  res.json(await Booking.find({ expo: req.params.id })
    .populate('user', 'name email')
    .populate('session', 'title location startTime')
    .sort({ createdAt: -1 }))
})

// POST /api/expos
// Purpose: Admin-only route that creates a new expo and stores the creator as
// its organizer.
router.post('/', auth, allow('admin'), async (req, res) => {
  const data = pick(req.body, EXPO_FIELDS)
  if (!data.title || !data.date || !data.location)
    return res.status(400).json({ message: 'Title, date and location are required' })
  const expo = await Expo.create({ ...data, organizer: req.user.id })
  emitChange(req.app.get('io'), 'expos', { expoId: expo._id.toString() })
  res.status(201).json(expo)
})

// PUT /api/expos/:id
// Purpose: Admin-only route that updates an existing expo. When the cover image
// is replaced, the previously uploaded file is deleted to avoid orphans.
router.put('/:id', auth, allow('admin'), async (req, res) => {
  const existing = await Expo.findById(req.params.id)
  if (!existing) return res.status(404).json({ message: 'Expo not found' })

  const data = pick(req.body, EXPO_FIELDS)
  if (data.image !== undefined && data.image !== existing.image) removeUpload(existing.image)

  const expo = await Expo.findByIdAndUpdate(req.params.id, data, { new: true })
  emitChange(req.app.get('io'), 'expos', { expoId: expo._id.toString() })
  res.json(expo)
})

// DELETE /api/expos/:id
// Purpose: Admin-only route that deletes an expo together with everything that
// belongs to it (booths, sessions, bookings, exhibitor profiles, announcements,
// favourites, waitlists) and its uploaded cover image, so no orphan data remains.
router.delete('/:id', auth, allow('admin'), async (req, res) => {
  const expo = await Expo.findByIdAndDelete(req.params.id)
  if (!expo) return res.status(404).json({ message: 'Expo not found' })

  removeUpload(expo.image)
  await Promise.all([
    Booth.deleteMany({ expo: req.params.id }),
    Session.deleteMany({ expo: req.params.id }),
    Booking.deleteMany({ expo: req.params.id }),
    Exhibitor.deleteMany({ expo: req.params.id }),
    Announcement.deleteMany({ expo: req.params.id }),
    Favourite.deleteMany({ expo: req.params.id }),
    Waitlist.deleteMany({ expo: req.params.id })
  ])
  emitChange(req.app.get('io'), 'expos', { expoId: req.params.id })
  res.json({ message: 'Expo deleted' })
})

// GET /api/expos/:id/analytics
// Purpose: Admin-only dashboard statistics for one expo — exhibitor counts,
// booths (total/occupied/occupancy), sessions, bookings and a per-session
// booking breakdown used to draw charts.
router.get('/:id/analytics', auth, allow('admin'), async (req, res) => {
  const [exhibitors, approved, pending, rejected, booths, sessions, bookings, bookingDocs] = await Promise.all([
    Exhibitor.countDocuments({ expo: req.params.id }),
    Exhibitor.countDocuments({ expo: req.params.id, status: 'approved' }),
    Exhibitor.countDocuments({ expo: req.params.id, status: 'pending' }),
    Exhibitor.countDocuments({ expo: req.params.id, status: 'rejected' }),
    Booth.find({ expo: req.params.id }),
    Session.countDocuments({ expo: req.params.id }),
    Booking.countDocuments({ expo: req.params.id }),
    Booking.find({ expo: req.params.id }).populate('session', 'title')
  ])

  const occupiedBooths = booths.filter((b) => b.status !== 'available').length
  const availableBooths = booths.length - occupiedBooths

  const bySession = {}
  bookingDocs.forEach((b) => {
    const title = b.session?.title || 'Removed session'
    bySession[title] = (bySession[title] || 0) + 1
  })
  const bookingsBySession = Object.entries(bySession)
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => b.count - a.count)

  res.json({
    exhibitors,
    approvedExhibitors: approved,
    pendingExhibitors: pending,
    rejectedExhibitors: rejected,
    totalBooths: booths.length,
    occupiedBooths,
    availableBooths,
    occupancyRate: booths.length ? Math.round((occupiedBooths / booths.length) * 100) : 0,
    sessions,
    bookings,
    bookingsBySession
  })
})

module.exports = router
