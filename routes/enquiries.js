const router = require('express').Router()
const Enquiry = require('../models/Enquiry')
const Exhibitor = require('../models/Exhibitor')
const { auth, allow } = require('../middleware/auth')
const { notify } = require('../utils/notify')

// POST /api/enquiries
// Purpose: Lets a logged-in attendee send a direct enquiry/message to an
// exhibitor; the exhibitor is notified instantly.
router.post('/', auth, async (req, res) => {
  const { exhibitor, message } = req.body
  if (!exhibitor || !message)
    return res.status(400).json({ message: 'Exhibitor and message are required' })

  const profile = await Exhibitor.findById(exhibitor)
  if (!profile) return res.status(404).json({ message: 'Exhibitor not found' })

  const enquiry = await Enquiry.create({
    from: req.user.id,
    exhibitor: profile._id,
    expo: profile.expo,
    message
  })

  await notify(req.app.get('io'), profile.user, {
    title: '💬 New enquiry received',
    message: `${req.user.name || 'A visitor'}: ${message.slice(0, 80)}`,
    type: 'enquiry',
    link: '/exhibitor'
  })

  res.status(201).json(enquiry)
})

// GET /api/enquiries/mine
// Purpose: Lists the enquiries the current user has sent, with the exhibitor
// company and any reply, for the "My messages" view.
router.get('/mine', auth, async (req, res) => {
  res.json(await Enquiry.find({ from: req.user.id })
    .populate({ path: 'exhibitor', select: 'company logo' })
    .sort({ createdAt: -1 }))
})

// GET /api/enquiries/received
// Purpose: Lists all enquiries received by the logged-in exhibitor's company
// profiles, so they can read and answer them.
router.get('/received', auth, allow('exhibitor'), async (req, res) => {
  const profiles = await Exhibitor.find({ user: req.user.id }).distinct('_id')
  res.json(await Enquiry.find({ exhibitor: { $in: profiles } })
    .populate('from', 'name email')
    .populate('expo', 'title')
    .sort({ createdAt: -1 }))
})

// POST /api/enquiries/:id/reply
// Purpose: Lets the exhibitor who received an enquiry reply to it; the sender
// is notified in real time (and by email when SMTP is configured).
router.post('/:id/reply', auth, allow('exhibitor'), async (req, res) => {
  const { reply } = req.body
  if (!reply) return res.status(400).json({ message: 'Reply message is required' })

  const enquiry = await Enquiry.findById(req.params.id).populate('exhibitor', 'user company')
  if (!enquiry) return res.status(404).json({ message: 'Enquiry not found' })
  if (enquiry.exhibitor?.user?.toString() !== req.user.id)
    return res.status(403).json({ message: 'This enquiry is not addressed to you' })

  enquiry.reply = reply
  enquiry.repliedAt = new Date()
  enquiry.status = 'replied'
  await enquiry.save()

  await notify(req.app.get('io'), enquiry.from, {
    title: `↩️ ${enquiry.exhibitor?.company || 'Exhibitor'} replied`,
    message: reply.slice(0, 80),
    type: 'enquiry',
    link: '/my-messages'
  })

  res.json(enquiry)
})

// GET /api/enquiries/all
// Purpose: Admin-only overview of every enquiry in the system.
router.get('/all', auth, allow('admin'), async (req, res) => {
  res.json(await Enquiry.find()
    .populate('from', 'name email')
    .populate({ path: 'exhibitor', select: 'company' })
    .populate('expo', 'title')
    .sort({ createdAt: -1 }))
})

module.exports = router
