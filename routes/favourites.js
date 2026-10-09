const router = require('express').Router()
const Favourite = require('../models/Favourite')
const { auth } = require('../middleware/auth')

// GET /api/favourites
// Purpose: Returns the logged-in user's saved expos (newest first) with the
// expo summary, for the "Saved" view.
router.get('/', auth, async (req, res) => {
  res.json(await Favourite.find({ user: req.user.id })
    .populate('expo', 'title date location image theme lat lng')
    .sort({ createdAt: -1 }))
})

// GET /api/favourites/ids
// Purpose: Lightweight list of favourited expo ids so the UI can mark hearts.
router.get('/ids', auth, async (req, res) => {
  res.json(await Favourite.find({ user: req.user.id }).distinct('expo'))
})

// POST /api/favourites
// Purpose: Saves (bookmarks) an expo for the current user (idempotent).
router.post('/', auth, async (req, res) => {
  const { expo } = req.body
  if (!expo) return res.status(400).json({ message: 'Expo is required' })
  try {
    const favourite = await Favourite.create({ user: req.user.id, expo })
    res.status(201).json(favourite)
  } catch (err) {
    if (err.code === 11000) return res.json({ message: 'Already saved' })
    throw err
  }
})

// DELETE /api/favourites/:expoId
// Purpose: Removes an expo from the current user's saved list.
router.delete('/:expoId', auth, async (req, res) => {
  await Favourite.deleteOne({ user: req.user.id, expo: req.params.expoId })
  res.json({ message: 'Removed from saved' })
})

module.exports = router
