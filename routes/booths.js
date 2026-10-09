const router = require('express').Router()
const Booth = require('../models/Booth')
const Exhibitor = require('../models/Exhibitor')
const { auth, allow } = require('../middleware/auth')
const { emitChange, notify } = require('../utils/notify')
const { pick } = require('../utils/validate')

const BOOTH_FIELDS = ['number', 'size', 'status', 'expo']

// GET /api/booths/expo/:expoId
// Purpose: Public floor-plan data - lists every booth of one expo with the
// name of the exhibitor that holds it, used by the expo detail page.
router.get('/expo/:expoId', async (req, res) => {
  res.json(await Booth.find({ expo: req.params.expoId }).populate('exhibitor', 'name'))
})

// POST /api/booths
// Purpose: Admin-only route that adds a new booth to an expo's floor plan.
router.post('/', auth, allow('admin'), async (req, res) => {
  const data = pick(req.body, BOOTH_FIELDS)
  if (!data.expo || !data.number)
    return res.status(400).json({ message: 'Expo and booth number are required' })
  const booth = await Booth.create(data)
  emitChange(req.app.get('io'), 'booths', { expoId: String(booth.expo) })
  res.status(201).json(booth)
})

// PUT /api/booths/:id
// Purpose: Admin-only route that edits an existing booth (number, size,
// status, ...).
router.put('/:id', auth, allow('admin'), async (req, res) => {
  const booth = await Booth.findByIdAndUpdate(req.params.id, pick(req.body, BOOTH_FIELDS), { new: true })
  if (!booth) return res.status(404).json({ message: 'Booth not found' })
  emitChange(req.app.get('io'), 'booths', { expoId: String(booth.expo) })
  res.json(booth)
})

// POST /api/booths/:id/reserve
// Purpose: Lets an approved exhibitor reserve one available booth for the
// selected expo; rejects unapproved accounts and second reservations.
router.post('/:id/reserve', auth, allow('exhibitor'), async (req, res) => {
  const booth = await Booth.findById(req.params.id)
  if (!booth) return res.status(404).json({ message: 'Booth not found' })

  const approved = await Exhibitor.findOne({
    user: req.user.id,
    expo: booth.expo,
    status: 'approved'
  })
  if (!approved)
    return res.status(403).json({ message: 'You Have Not This Expo Approved Account' })

  const existingReservation = await Booth.findOne({
    expo: booth.expo,
    exhibitor: req.user.id,
    status: 'reserved'
  })
  if (existingReservation)
    return res.status(409).json({ message: 'You already reserved one slot' })

  if (booth.status !== 'available')
    return res.status(400).json({ message: 'Booth not available' })

  booth.status = 'reserved'
  booth.exhibitor = req.user.id
  await booth.save()

  const io = req.app.get('io')
  emitChange(io, 'booths', { expoId: String(booth.expo) })
  await notify(io, req.user.id, {
    title: `✅ Booth ${booth.number} reserved`,
    message: 'Your reservation has been confirmed.',
    type: 'booth',
    link: `/expos/${booth.expo}`
  })

  res.json(booth)
})

// DELETE /api/booths/:id/reserve
// Purpose: Lets the reserving exhibitor remove their own booth reservation.
router.delete('/:id/reserve', auth, allow('exhibitor'), async (req, res) => {
  const booth = await Booth.findById(req.params.id)
  if (!booth) return res.status(404).json({ message: 'Booth not found' })
  if (booth.exhibitor?.toString() !== req.user.id)
    return res.status(403).json({ message: 'You did not reserve this booth' })

  booth.status = 'available'
  booth.exhibitor = null
  await booth.save()
  emitChange(req.app.get('io'), 'booths', { expoId: String(booth.expo) })
  res.json({ message: 'Reservation removed successfully', booth })
})

// DELETE /api/booths/:id
// Purpose: Admin-only route that removes a booth from the floor plan.
router.delete('/:id', auth, allow('admin'), async (req, res) => {
  const booth = await Booth.findByIdAndDelete(req.params.id)
  if (!booth) return res.status(404).json({ message: 'Booth not found' })
  emitChange(req.app.get('io'), 'booths', { expoId: String(booth.expo) })
  res.json({ message: 'Booth deleted' })
})

module.exports = router
