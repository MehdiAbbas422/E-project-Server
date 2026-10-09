const router = require('express').Router()
const User = require('../models/User')
const { auth, allow } = require('../middleware/auth')
const { getPagination, paginatedResponse } = require('../utils/paginate')
const { escapeRegex } = require('../utils/validate')

// GET /api/admin/users
// Purpose: Admin-only user directory with optional text search and pagination,
// used for managing accounts and roles.
router.get('/users', auth, allow('admin'), async (req, res) => {
  const { search } = req.query
  const query = {}
  if (search) {
    const safe = escapeRegex(search)
    query.$or = [{ name: new RegExp(safe, 'i') }, { email: new RegExp(safe, 'i') }]
  }

  const p = getPagination(req, 10)
  if (p) {
    return res.json(await paginatedResponse(
      User, query,
      { sort: { createdAt: -1 }, select: '-password' },
      p
    ))
  }
  res.json(await User.find(query).select('-password').sort({ createdAt: -1 }))
})

// PATCH /api/admin/users/:id
// Purpose: Admin-only update of a user's role and/or blocked status. Admins
// cannot change their own role or block themselves.
router.patch('/users/:id', auth, allow('admin'), async (req, res) => {
  const { role, blocked } = req.body
  if (req.params.id === req.user.id)
    return res.status(400).json({ message: 'You cannot modify your own account here' })

  if (role !== undefined && !['admin', 'exhibitor', 'attendee'].includes(role))
    return res.status(400).json({ message: 'Invalid role' })

  const update = {}
  if (role !== undefined) update.role = role
  if (blocked !== undefined) update.blocked = Boolean(blocked)

  const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password')
  if (!user) return res.status(404).json({ message: 'User not found' })
  res.json(user)
})

// DELETE /api/admin/users/:id
// Purpose: Admin-only removal of a user account (admins cannot delete themselves).
router.delete('/users/:id', auth, allow('admin'), async (req, res) => {
  if (req.params.id === req.user.id)
    return res.status(400).json({ message: 'You cannot delete your own account' })

  const user = await User.findByIdAndDelete(req.params.id)
  if (!user) return res.status(404).json({ message: 'User not found' })
  res.json({ message: 'User deleted' })
})

module.exports = router
