const Notification = require('../models/Notification')

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
 */
const emitChange = (io, scope, payload = {}) => {
  if (!io) return
  const event = { scope, ...payload, at: Date.now() }
  if (payload.expoId) io.to(`expo:${payload.expoId}`).emit('data:changed', event)
  io.to('admins').emit('data:changed', event)
  if (!payload.expoId) io.emit('data:changed', event)
}

module.exports = { notify, emitChange, getIO }
