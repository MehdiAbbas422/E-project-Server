const router = require('express').Router()
const { auth, allow } = require('../middleware/auth')
const { emitChange, notify } = require('../utils/notify')
const { sendMail } = require('../config/mailer')

// POST /api/payments/webhook
// Purpose: Stripe webhook endpoint that listens for payment success/failure
// events and updates the exhibitor profile status accordingly.
// NOTE: This route is mounted BEFORE express.json() in server.js so that
//       Stripe can verify the raw request signature.
router.post('/webhook', async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET)
    return res.status(503).json({ message: 'Stripe webhook is not configured on the server' })

  const sig = req.headers['stripe-signature']
  let event

  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return res.status(400).json({ message: 'Webhook signature verification failed' })
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object
    const { expoId, exhibitorId, userId } = paymentIntent.metadata

    try {
      const Exhibitor = require('../models/Exhibitor')
      const Expo = require('../models/Expo')
      const User = require('../models/User')

      const exhibitor = await Exhibitor.findById(exhibitorId)
      if (exhibitor && exhibitor.status === 'pending') {
        exhibitor.status = 'approved'
        exhibitor.paymentStatus = 'paid'
        exhibitor.paymentId = paymentIntent.id
        await exhibitor.save()

        const expo = await Expo.findById(expoId)
        const io = req.app.get('io')
        if (io) {
          emitChange(io, 'exhibitors', { expoId: String(expoId) })
          await notify(io, userId, {
            title: 'Payment successful!',
            message: `Your exhibitor registration for ${expo?.title || 'the expo'} is confirmed.`,
            type: 'payment',
            link: '/exhibitor'
          })
        }

        try {
          const user = await User.findById(userId)
          if (user?.email) {
            await sendMail({
              to: user.email,
              subject: 'EventSphere - Exhibitor Registration Confirmed',
              html: `<p>Your payment of <b>₹${(paymentIntent.amount / 100).toFixed(2)}</b> for <b>${expo?.title || 'the expo'}</b> was successful. Your exhibitor registration is now <b>approved</b>.</p>`
            })
          }
        } catch (mailErr) {
          console.error('Payment confirmation email failed:', mailErr.message)
        }
      }
    } catch (err) {
      console.error('Error processing payment success:', err.message)
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const paymentIntent = event.data.object
    const { userId, expoId } = paymentIntent.metadata
    const io = req.app.get('io')
    if (io) {
      await notify(io, userId, {
        title: 'Payment failed',
        message: 'Your exhibitor registration payment was not successful. Please try again.',
        type: 'payment',
        link: '/exhibitor'
      })
    }
  }

  res.json({ received: true })
})

module.exports = router
