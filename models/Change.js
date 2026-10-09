const mongoose = require('mongoose')

/**
 * Change — a tiny "something changed" marker written whenever the API mutates
 * data that open pages care about. Serverless hosts (Vercel) cannot keep a
 * Socket.IO server alive, so the client polls GET /api/events?since=... and
 * refreshes itself from these rows instead of receiving a live push.
 *
 * Rows auto-expire after one hour via the TTL index so the collection stays
 * small without any cleanup job.
 */
const changeSchema = new mongoose.Schema({
  scope: { type: String, default: '' },
  expoId: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, expires: 3600 }
})

module.exports = mongoose.model('Change', changeSchema)
