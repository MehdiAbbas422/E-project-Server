const router = require('express').Router()
const Session = require('../models/Session')
const Booking = require('../models/Booking')
const Waitlist = require('../models/Waitlist')
const { auth, allow } = require('../middleware/auth')
const { emitChange, notify } = require('../utils/notify')
const { pick, escapeRegex } = require('../utils/validate')

const SESSION_FIELDS = ['expo', 'title', 'speaker', 'topic', 'location', 'lat', 'lng', 'capacity', 'startTime', 'endTime']

// Purpose: Builds a human friendly time slot used in notification text.
const slot = (session) => `${new Date(session.startTime).toLocaleString()} – ${new Date(session.endTime).toLocaleTimeString()}`

// Purpose: Detects an overlapping session in the same expo (same hall or same
// speaker at an overlapping time) so double-booking is prevented.
const findConflict = async ({ expo, startTime, endTime, location, speaker, excludeId }) => {
  if (!expo || !startTime || !endTime) return null
  const clauses = []
  if (location && location.trim()) clauses.push({ location: new RegExp(`^${escapeRegex(location.trim().replace(/[\s]+/g, ' '))}$`, 'i') })
  if (speaker && speaker.trim()) clauses.push({ speaker: new RegExp(`^${escapeRegex(speaker.trim())}$`, 'i') })
  if (!clauses.length) return null

  const query = {
    expo,
    startTime: { $lt: new Date(endTime) },
    endTime: { $gt: new Date(startTime) },
    $or: clauses
  }
  if (excludeId) query._id = { $ne: excludeId }
  return Session.findOne(query)
}

// Purpose: When a seat frees up in a full session, moves the oldest waitlisted
// user into a confirmed booking and notifies them.
const promoteFromWaitlist = async (io, session) => {
  if (!session || !(session.capacity > 0)) return null
  const booked = await Booking.countDocuments({ session: session._id })
  if (booked >= session.capacity) return null

  const next = await Waitlist.findOne({ session: session._id }).sort({ createdAt: 1 })
  if (!next) return null

  await Waitlist.deleteOne({ _id: next._id })
  await Booking.create({ user: next.user, expo: next.expo, session: session._id })
  await notify(io, next.user, {
    title: `🎟️ You're off the waitlist: ${session.title}`,
    message: 'A seat opened up and your booking is now confirmed.',
    type: 'booking',
    link: '/my-bookings'
  })
  emitChange(io, 'bookings', { expoId: String(session.expo) })
  return next
}

// GET /api/sessions/expo/:expoId
// Purpose: Public agenda of one expo - returns all sessions sorted by start
// time, each with its live seat count for the schedule section.
router.get('/expo/:expoId', async (req, res) => {
  const sessions = await Session.find({ expo: req.params.expoId }).sort({ startTime: 1 })
  const counts = await Booking.aggregate([
    { $match: { session: { $in: sessions.map((s) => s._id) } } },
    { $group: { _id: '$session', count: { $sum: 1 } } }
  ])
  const map = Object.fromEntries(counts.map((c) => [String(c._id), c.count]))
  res.json(sessions.map((s) => ({ ...s.toObject(), seats: s.capacity || null, booked: map[String(s._id)] || 0 })))
})

// GET /api/sessions/bookings/me
// Purpose: Returns every session the current user has booked (any role), with
// the session details and expo summary, for the "My bookings" page.
router.get('/bookings/me', auth, async (req, res) => {
  res.json(await Booking.find({ user: req.user.id })
    .populate('session')
    .populate('expo', 'title date image lat lng location')
    .sort({ createdAt: -1 }))
})

// DELETE /api/sessions/bookings/:id
// Purpose: Cancels a booking (owner or admin). If the session had a waitlist,
// the next person is automatically promoted and notified.
router.delete('/bookings/:id', auth, async (req, res) => {
  const booking = await Booking.findById(req.params.id)
  if (!booking) return res.status(404).json({ message: 'Booking not found' })
  if (String(booking.user) !== req.user.id && req.user.role !== 'admin')
    return res.status(403).json({ message: 'You cannot cancel this booking' })

  await Booking.findByIdAndDelete(booking._id)
  const io = req.app.get('io')
  emitChange(io, 'bookings', { expoId: String(booking.expo) })

  const session = await Session.findById(booking.session)
  await promoteFromWaitlist(io, session)

  res.json({ message: 'Booking cancelled', booking })
})

// GET /api/sessions/waitlist/me
// Purpose: Lists the sessions the current user is waitlisted for.
router.get('/waitlist/me', auth, async (req, res) => {
  res.json(await Waitlist.find({ user: req.user.id })
    .populate('session')
    .populate('expo', 'title date')
    .sort({ createdAt: -1 }))
})

// DELETE /api/sessions/waitlist/:id
// Purpose: Removes the current user from a session's waitlist.
router.delete('/waitlist/:id', auth, async (req, res) => {
  const entry = await Waitlist.findOneAndDelete({ _id: req.params.id, user: req.user.id })
  if (!entry) return res.status(404).json({ message: 'Waitlist entry not found' })
  res.json({ message: 'Removed from waitlist' })
})

// POST /api/sessions
// Purpose: Admin-only route that schedules a new session/talk inside an expo.
// Rejects invalid times and scheduling conflicts (same hall/speaker overlap).
router.post('/', auth, allow('admin'), async (req, res) => {
  const data = pick(req.body, SESSION_FIELDS)
  if (!data.expo || !data.title || !data.startTime || !data.endTime)
    return res.status(400).json({ message: 'Expo, title, start time and end time are required' })
  if (new Date(data.startTime) >= new Date(data.endTime))
    return res.status(400).json({ message: 'End time must be after the start time' })

  const conflict = await findConflict(data)
  if (conflict)
    return res.status(409).json({ message: `Conflict with "${conflict.title}" — same hall or speaker at an overlapping time` })

  const session = await Session.create(data)
  emitChange(req.app.get('io'), 'sessions', { expoId: String(session.expo) })
  res.status(201).json(session)
})

// PUT /api/sessions/:id
// Purpose: Admin-only route that updates an existing session and re-checks for
// scheduling conflicts.
router.put('/:id', auth, allow('admin'), async (req, res) => {
  const data = pick(req.body, SESSION_FIELDS)
  const current = await Session.findById(req.params.id)
  if (!current) return res.status(404).json({ message: 'Session not found' })
  if (data.startTime && data.endTime && new Date(data.startTime) >= new Date(data.endTime))
    return res.status(400).json({ message: 'End time must be after the start time' })

  const conflict = await findConflict({
    expo: data.expo || current.expo,
    startTime: data.startTime || current.startTime,
    endTime: data.endTime || current.endTime,
    location: data.location !== undefined ? data.location : current.location,
    speaker: data.speaker !== undefined ? data.speaker : current.speaker,
    excludeId: current._id
  })
  if (conflict)
    return res.status(409).json({ message: `Conflict with "${conflict.title}" — same hall or speaker at an overlapping time` })

  const session = await Session.findByIdAndUpdate(req.params.id, data, { new: true })
  emitChange(req.app.get('io'), 'sessions', { expoId: String(session.expo) })
  res.json(session)
})

// DELETE /api/sessions/:id
// Purpose: Admin-only route that cancels/deletes a scheduled session together
// with its bookings and waitlist entries.
router.delete('/:id', auth, allow('admin'), async (req, res) => {
  const session = await Session.findByIdAndDelete(req.params.id)
  if (!session) return res.status(404).json({ message: 'Session not found' })
  await Promise.all([
    Booking.deleteMany({ session: session._id }),
    Waitlist.deleteMany({ session: session._id })
  ])
  emitChange(req.app.get('io'), 'sessions', { expoId: String(session.expo) })
  res.json({ message: 'Session deleted' })
})

// GET /api/sessions/:id/bookings
// Purpose: Admin-only attendee list for one session (who booked a seat).
router.get('/:id/bookings', auth, allow('admin'), async (req, res) => {
  res.json(await Booking.find({ session: req.params.id }).populate('user', 'name email'))
})

// POST /api/sessions/:id/book
// Purpose: Lets a logged-in user book a seat in a session; blocks duplicate
// bookings, enforces the seat limit and confirms with a live notification.
router.post('/:id/book', auth, async (req, res) => {
  const session = await Session.findById(req.params.id)
  if (!session) return res.status(404).json({ message: 'Session not found' })

  const existing = await Booking.findOne({ user: req.user.id, session: session._id })
  if (existing) return res.status(409).json({ message: 'You already booked this session' })

  if (session.capacity > 0) {
    const booked = await Booking.countDocuments({ session: session._id })
    if (booked >= session.capacity)
      return res.status(409).json({ message: 'This session is full', full: true })
  }

  const booking = await Booking.create({ user: req.user.id, expo: session.expo, session: session._id })
  await Waitlist.deleteOne({ user: req.user.id, session: session._id })

  const io = req.app.get('io')
  emitChange(io, 'bookings', { expoId: String(session.expo) })
  await notify(io, req.user.id, {
    title: `🎟️ Booked: ${session.title}`,
    message: slot(session),
    type: 'booking',
    link: '/my-bookings'
  })

  res.status(201).json(booking)
})

// POST /api/sessions/:id/waitlist
// Purpose: Adds a user to a full session's waitlist; they are auto-booked when
// a seat is freed (a booking is cancelled).
router.post('/:id/waitlist', auth, async (req, res) => {
  const session = await Session.findById(req.params.id)
  if (!session) return res.status(404).json({ message: 'Session not found' })

  const alreadyBooked = await Booking.findOne({ user: req.user.id, session: session._id })
  if (alreadyBooked) return res.status(409).json({ message: 'You already booked this session' })

  if (!(session.capacity > 0))
    return res.status(400).json({ message: 'This session has no seat limit — just book it' })

  const booked = await Booking.countDocuments({ session: session._id })
  if (booked < session.capacity)
    return res.status(400).json({ message: 'Seats are available — you can book directly' })

  try {
    const entry = await Waitlist.create({ user: req.user.id, session: session._id, expo: session.expo })
    await notify(req.app.get('io'), req.user.id, {
      title: `⏳ Waitlisted: ${session.title}`,
      message: 'We will notify you if a seat opens up.',
      type: 'booking',
      link: '/my-bookings'
    })
    res.status(201).json(entry)
  } catch (err) {
    if (err.code === 11000) return res.json({ message: 'You are already on the waitlist' })
    throw err
  }
})

module.exports = router
