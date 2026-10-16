const router = require('express').Router()
const { auth, allow } = require('../middleware/auth')
const Expo = require('../models/Expo')
const Booth = require('../models/Booth')
const Exhibitor = require('../models/Exhibitor')

// GET /api/analytics/monthly
// Purpose: Admin-only monthly analytics — expos created, booths, exhibitors,
// booths sold, booths unsold, and total earnings per month for the last 12 months.
router.get('/monthly', auth, allow('admin'), async (req, res) => {
  const now = new Date()
  const months = []

  // Build last 12 months array
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const year = d.getFullYear()
    const month = d.getMonth()
    const nextMonth = month === 11 ? new Date(year + 1, 0, 1) : new Date(year, month + 1, 1)

    const [expos, booths, exhibitors, soldBooths, earnings] = await Promise.all([
      Expo.countDocuments({ createdAt: { $gte: d, $lt: nextMonth } }),
      Booth.countDocuments({ createdAt: { $gte: d, $lt: nextMonth } }),
      Exhibitor.countDocuments({ createdAt: { $gte: d, $lt: nextMonth } }),
      Booth.countDocuments({ status: 'reserved', createdAt: { $gte: d, $lt: nextMonth } }),
      Booth.aggregate([
        { $match: { status: 'reserved', createdAt: { $gte: d, $lt: nextMonth } } },
        { $group: { _id: null, total: { $sum: '$price' } } }
      ])
    ])

    const totalEarnings = earnings.length > 0 ? earnings[0].total : 0

    months.push({
      month: d.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
      monthKey: `${year}-${String(month + 1).padStart(2, '0')}`,
      expos,
      booths,
      exhibitors,
      boothsSold: soldBooths,
      boothsUnsold: booths - soldBooths,
      earnings: totalEarnings
    })
  }

  res.json(months)
})

module.exports = router
