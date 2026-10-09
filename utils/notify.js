const Notification = require('../models/Notification')
const Change = require('../models/Change')

/**
 * Safely fetch the Socket.IO instance attached to the Express app.
 */
const getIO = (app) => (app && typeof app.get === 'function' ? app.get('io') : null)

/**
 * Creates an in-app notification for one user and pushes it live through
 * Socket.IO to that user's private room (`user:<id>`).
 */
const notify = async (io, userId, { title, message = '', type = 'system', link = '' }) => {
  const notification = await Notification.create({ user: userId, title, message, type, link })
  if (io) io.to(`user:${userId}`).emit('notification', notification)
  return notification
}

/**
 * Broadcasts a "data changed" event so open pages can refresh themselves
 * (real-time event information) without a manual reload.
 *
 * It also records a lightweight Change row so clients on a serverless host
 * (where Socket.IO is unavailable) can pick the update up by polling
 * GET /api/events. The row write is fire-and-forget so callers stay fast.
 */
const emitChange = (io, scope, payload = {}) => {
  const event = { scope, ...payload, at: Date.now() }

  if (io) {
    if (payload.expoId) io.to(`expo:${payload.expoId}`).emit('data:changed', event)
    io.to('admins').emit('data:changed', event)
    if (!payload.expoId) io.emit('data:changed', event)
  }

  Change.create({
    scope,
    expoId: payload.expoId ? String(payload.expoId) : ''
  }).catch(() => {
    /* a missed change marker only delays a refresh, never breaks the request */
  })
}

module.exports = { notify, emitChange, getIO }
