const router = require('express').Router()
const Exhibitor = require('../models/Exhibitor')
const { auth, allow } = require('../middleware/auth')
const { emitChange, notify } = require('../utils/notify')
const { pick, escapeRegex } = require('../utils/validate')
const { getPagination, paginatedResponse } = require('../utils/paginate')
const { removeUpload } = require('../utils/files')
const { sendMail } = require('../config/mailer')

const EXHIBITOR_FIELDS = ['expo', 'company', 'description', 'products', 'logo', 'contact']

// GET /api/exhibitors
// Purpose: Public exhibitor directory - only approved profiles are returned,
// with optional filtering by expo and text search on company/products/description.
router.get('/', async (req, res) => {
  const { search, expo } = req.query
  const query = {}
  if (expo) query.expo = expo
  if (search) {
    const safe = escapeRegex(search)
    query.$or = [
      { company: new RegExp(safe, 'i') },
      { products: new RegExp(safe, 'i') },
      { description: new RegExp(safe, 'i') }
    ]
  }
  const approvedQuery = { ...query, status: 'approved' }
  const p = getPagination(req, 9)
  if (p) {
    return res.json(await paginatedResponse(
      Exhibitor, approvedQuery,
      { sort: { createdAt: -1 }, populate: [['user', 'name email'], ['expo', 'title']] },
      p
    ))
  }
  res.json(await Exhibitor.find(approvedQuery)
    .populate('user', 'name email')
    .populate('expo', 'title'))
})

// GET /api/exhibitors/me
// Purpose: Returns the logged-in exhibitor's own profiles (all statuses) for
// the exhibitor portal, one per expo they applied to.
router.get('/me', auth, allow('exhibitor'), async (req, res) => {
  res.json(await Exhibitor.find({ user: req.user.id }).populate('expo', 'title'))
})

// GET /api/exhibitors/all
// Purpose: Admin-only list of every exhibitor profile (any status) together
// with its expo - used by the dashboard approval queue.
router.get('/all', auth, allow('admin'), async (req, res) => {
  res.json(await Exhibitor.find().populate('user', 'name email').populate('expo', 'title'))
})

// POST /api/exhibitors
// Purpose: Lets a logged-in exhibitor create their own company profile
// (logo image path, products, contact, chosen expo) for admin approval.
router.post('/', auth, allow('exhibitor'), async (req, res) => {
  const data = pick(req.body, EXHIBITOR_FIELDS)
  if (!data.expo || !data.company)
    return res.status(400).json({ message: 'Expo and company name are required' })

  const existing = await Exhibitor.findOne({ user: req.user.id, expo: data.expo })
  if (existing)
    return res.status(409).json({ message: 'You have already applied to this expo' })

  try {
    const exhibitor = await Exhibitor.create({ ...data, user: req.user.id })
    emitChange(req.app.get('io'), 'exhibitors', { expoId: String(exhibitor.expo) })
    res.status(201).json(exhibitor)
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ message: 'You have already applied to this expo' })
    throw err
  }
})

// PUT /api/exhibitors/:id
// Purpose: Lets an exhibitor edit their own profile, including the uploaded
// JPG/PNG logo address.
router.put('/:id', auth, allow('exhibitor'), async (req, res) => {
  const exhibitor = await Exhibitor.findOne({ _id: req.params.id, user: req.user.id })
  if (!exhibitor) return res.status(404).json({ message: 'Exhibitor profile not found' })

  const data = pick(req.body, ['company', 'description', 'products', 'logo', 'contact'])
  if (data.logo !== undefined && data.logo !== exhibitor.logo) removeUpload(exhibitor.logo)
  Object.assign(exhibitor, data)
  await exhibitor.save()
  emitChange(req.app.get('io'), 'exhibitors', { expoId: String(exhibitor.expo) })
  res.json(exhibitor)
})

// PATCH /api/exhibitors/:id/status
// Purpose: Admin-only approval workflow — approves or rejects an application,
// notifies the exhibitor in real time and by email, and refreshes open pages.
router.patch('/:id/status', auth, allow('admin'), async (req, res) => {
  const { status } = req.body
  if (!['approved', 'rejected', 'pending'].includes(status))
    return res.status(400).json({ message: 'Status must be approved, rejected or pending' })

  const exhibitor = await Exhibitor.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  ).populate('expo', 'title')

  if (!exhibitor) return res.status(404).json({ message: 'Exhibitor not found' })

  const io = req.app.get('io')
  emitChange(io, 'exhibitors', { expoId: String(exhibitor.expo?._id || exhibitor.expo) })

  const approved = status === 'approved'
  await notify(io, exhibitor.user, {
    title: approved ? '✅ Application approved' : '❌ Application rejected',
    message: `${exhibitor.company} · ${exhibitor.expo?.title || 'Expo'}`,
    type: 'exhibitor',
    link: '/exhibitor'
  })

  try {
    const user = await exhibitor.populate('user', 'email')
    if (user?.user?.email) {
      await sendMail({
        to: user.user.email,
        subject: approved ? 'Your EventSphere application was approved' : 'Update on your EventSphere application',
        html: approved
          ? `<p>Good news! Your exhibitor application for <b>${exhibitor.expo?.title || 'the expo'}</b> has been <b>approved</b>.</p>`
          : `<p>Your exhibitor application for <b>${exhibitor.expo?.title || 'the expo'}</b> was not approved this time.</p>`
      })
    }
  } catch (err) {
    console.error('Approval email failed:', err.message)
  }

  res.json(exhibitor)
})

// DELETE /api/exhibitors/:id
// Purpose: Admin-only route that removes an exhibitor profile.
router.delete('/:id', auth, allow('admin'), async (req, res) => {
  const exhibitor = await Exhibitor.findByIdAndDelete(req.params.id)
  if (!exhibitor) return res.status(404).json({ message: 'Exhibitor not found' })
  removeUpload(exhibitor.logo)
  emitChange(req.app.get('io'), 'exhibitors', { expoId: String(exhibitor.expo) })
  res.json({ message: 'Exhibitor deleted' })
})

module.exports = router
