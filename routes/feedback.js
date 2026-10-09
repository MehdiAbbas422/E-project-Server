const router = require('express').Router()
const Feedback = require('../models/Feedback')
const { auth, allow } = require('../middleware/auth')
const { notify } = require('../utils/notify')
const { getPagination, paginatedResponse } = require('../utils/paginate')

// POST /api/feedback
// Purpose: Stores feedback/support messages (suggestion or issue) submitted
// by any logged-in user, linked to their account.
router.post('/', auth, async (req, res) => {
  const { message, type = 'suggestion' } = req.body
  if (!message || !message.trim()) return res.status(400).json({ message: 'Please write a message' })
  if (!['suggestion', 'issue'].includes(type))
    return res.status(400).json({ message: 'Invalid feedback type' })

  res.status(201).json(await Feedback.create({ message, type, user: req.user.id }))
})

// GET /api/feedback/mine
// Purpose: Lets a user see their own submitted feedback together with any
// admin reply (two-way communication).
router.get('/mine', auth, async (req, res) => {
  res.json(await Feedback.find({ user: req.user.id }).sort({ createdAt: -1 }))
})

// GET /api/feedback
// Purpose: Admin-only inbox listing all feedback newest first (with optional
// pagination) so organizers can review user suggestions and reported issues.
router.get('/', auth, allow('admin'), async (req, res) => {
  const p = getPagination(req, 10)
  if (p) {
    return res.json(await paginatedResponse(
      Feedback, {},
      { sort: { createdAt: -1 }, populate: { path: 'user', select: 'name email' } },
      p
    ))
  }
  res.json(await Feedback.find().populate('user', 'name email').sort({ createdAt: -1 }))
})

// PATCH /api/feedback/:id/reply
// Purpose: Admin-only reply to a feedback message; the author is notified in
// real time and the thread is marked as resolved.
router.patch('/:id/reply', auth, allow('admin'), async (req, res) => {
  const { reply } = req.body
  if (!reply || !reply.trim()) return res.status(400).json({ message: 'Reply cannot be empty' })

  const feedback = await Feedback.findByIdAndUpdate(
    req.params.id,
    { reply, repliedAt: new Date(), status: 'resolved' },
    { new: true }
  )
  if (!feedback) return res.status(404).json({ message: 'Feedback not found' })

  await notify(req.app.get('io'), feedback.user, {
    title: '💬 Support replied to your feedback',
    message: reply.slice(0, 80),
    type: 'feedback',
    link: '/feedback'
  })

  res.json(feedback)
})

// DELETE /api/feedback/:id
// Purpose: Admin-only removal of a feedback message from the inbox and database.
router.delete('/:id', auth, allow('admin'), async (req, res) => {
  const feedback = await Feedback.findByIdAndDelete(req.params.id)
  if (!feedback) return res.status(404).json({ message: 'Feedback not found' })
  res.json({ message: 'Feedback deleted' })
})

module.exports = router
