const router = require('express').Router()
const Change = require('../models/Change')

// GET /api/events?since=<ISO timestamp>
// Purpose: Polling endpoint that replaces the live Socket.IO push on serverless
// hosts. It returns every data-change marker recorded after the client's last
// poll, so pages can refresh themselves without a manual reload.
router.get('/', async (req, res) => {
  const since = req.query.since ? new Date(req.query.since) : null
  const now = new Date().toISOString()

  if (!since || Number.isNaN(since.getTime())) return res.json({ now, changes: [] })

  const changes = await Change.find({ createdAt: { $gt: since } })
    .sort({ createdAt: 1 })
    .limit(100)

  res.json({
    now,
    changes: changes.map((c) => ({ scope: c.scope, expoId: c.expoId }))
  })
})

module.exports = router
