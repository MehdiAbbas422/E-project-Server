const router = require('express').Router()
const { auth, allow } = require('../middleware/auth')

// POST /api/payments/create-intent
// Purpose: Creates a Stripe PaymentIntent for an exhibitor registering for a
// paid expo. Returns the clientSecret needed by the frontend to confirm payment.
// Mounted AFTER express.json() so the request body is parsed as JSON.
router.post('/create-intent', auth, allow('exhibitor'), async (req, res) => {
  const { expoId, amount, exhibitorId } = req.body

  if (!expoId || !amount || amount <= 0)
    return res.status(400).json({ message: 'Valid expoId and positive amount are required' })
  if (!process.env.STRIPE_SECRET_KEY)
    return res.status(503).json({ message: 'Stripe payments are not configured on the server' })

  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'pkr',
      automatic_payment_methods: { enabled: true },
      metadata: { expoId: String(expoId), exhibitorId: String(exhibitorId), userId: req.user.id }
    })

    res.json({ clientSecret: paymentIntent.client_secret })
  } catch (err) {
    console.error('Stripe PaymentIntent error:', err.message)
    res.status(500).json({ message: 'Payment initialization failed' })
  }
})

module.exports = router
