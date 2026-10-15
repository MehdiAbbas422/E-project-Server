const router = require('express').Router()
const Booth = require('../models/Booth')
const Exhibitor = require('../models/Exhibitor')
const Expo = require('../models/Expo')
const { auth, allow } = require('../middleware/auth')
const { emitChange, notify } = require('../utils/notify')
const { pick } = require('../utils/validate')
const { isPastExpoDate } = require('../utils/dates')

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
// If the booth has a price, payment must be completed before reservation.
router.post('/:id/reserve', auth, allow('exhibitor'), async (req, res) => {
  const booth = await Booth.findById(req.params.id)
  if (!booth) return res.status(404).json({ message: 'Booth not found' })

  const expo = await Expo.findById(booth.expo)
  if (expo && isPastExpoDate(expo.date))
    return res.status(400).json({ message: 'This expo has already passed' })

  const approved = await Exhibitor.findOne({
    user: req.user.id,
    expo: booth.expo,
    status: 'approved'
  })
  if (!approved)
    return res.status(403).json({ message: 'You Have Not This Expo Approved Account' })

  if (booth.status !== 'available')
    return res.status(400).json({ message: 'Booth not available' })

  // If booth has a price, require payment before reservation
  if (booth.price > 0) {
    const { paymentId } = req.body
    if (!paymentId)
      return res.status(402).json({ message: 'Payment required', amount: booth.price, boothId: booth._id.toString() })

    // Verify payment was successful
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentId)
      if (paymentIntent.status !== 'succeeded')
        return res.status(402).json({ message: 'Payment not completed', amount: booth.price, boothId: booth._id.toString() })
      if (paymentIntent.metadata.boothId !== booth._id.toString())
        return res.status(400).json({ message: 'Payment does not match this booth' })
    } catch (err) {
      return res.status(400).json({ message: 'Invalid payment' })
    }

    booth.paymentStatus = 'paid'
    booth.paymentId = paymentId
  }

  booth.status = 'reserved'
  booth.exhibitor = req.user.id
  await booth.save()

  const io = req.app.get('io')
  emitChange(io, 'booths', { expoId: String(booth.expo) })
  await notify(io, req.user.id, {
    title: `✅ Booth ${booth.number} reserved`,
    message: booth.price > 0
      ? `Payment successful! Your booth reservation is confirmed.`
      : 'Your reservation has been confirmed.',
    type: 'booth',
    link: `/expos/${booth.expo}`
  })

  res.json(booth)
})

// POST /api/booths/:id/payment-intent
// Purpose: Creates a Stripe PaymentIntent for booth reservation payment.
router.post('/:id/payment-intent', auth, allow('exhibitor'), async (req, res) => {
  const booth = await Booth.findById(req.params.id)
  if (!booth) return res.status(404).json({ message: 'Booth not found' })
  if (booth.price <= 0)
    return res.status(400).json({ message: 'This booth does not require payment' })

  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(booth.price * 100),
      currency: 'inr',
      automatic_payment_methods: { enabled: true },
      metadata: { boothId: booth._id.toString(), userId: req.user.id, expoId: String(booth.expo) }
    })
    res.json({ clientSecret: paymentIntent.client_secret })
  } catch (err) {
    console.error('Stripe PaymentIntent error:', err.message)
    res.status(500).json({ message: 'Payment initialization failed' })
  }
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
