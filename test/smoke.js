/* eslint-disable no-console */
// Purpose: End-to-end smoke test for the EventSphere API. It boots the real
// Express + Socket.IO server against an in-memory MongoDB and walks through the
// critical user journeys (expos, sessions, bookings, waitlist promotion,
// favourites, admin user management, feedback and analytics) using HTTP calls.
//
// Run with:  npm run test:smoke
process.env.JWT_SECRET = process.env.JWT_SECRET || 'smoke-test-secret'
process.env.PORT = process.env.PORT || '5099'
process.env.CLIENT_URL = '*'

const { MongoMemoryServer } = require('mongodb-memory-server')
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')

const BASE = `http://127.0.0.1:${process.env.PORT}`
let passed = 0
let failed = 0

// Purpose: Tiny assertion helper that prints a tick/cross and tracks totals.
const check = (name, condition, extra = '') => {
  if (condition) {
    passed += 1
    console.log(`  \u2713 ${name}`)
  } else {
    failed += 1
    console.log(`  \u2717 ${name} ${extra}`)
  }
}

// Purpose: Calls the API and returns { status, data } for easy assertions.
const api = async (method, path, { token, body } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })
  let data = null
  try { data = await res.json() } catch { /* no body */ }
  return { status: res.status, data }
}

const main = async () => {
  console.log('Starting in-memory MongoDB…')
  const mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } })
  process.env.MONGO_URI = mongod.getUri('eventsphere')

  require('../server') // boots the real server on process.env.PORT

  // Wait until mongoose finishes connecting to the memory server.
  for (let i = 0; i < 80 && mongoose.connection.readyState !== 1; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  check('MongoDB connected', mongoose.connection.readyState === 1)

  // ---- test fixtures (created directly so we skip the OTP email flow) ----
  const User = require('../models/User')
  const hash = await bcrypt.hash('Passw0rd!', 4)
  const admin = await User.create({ name: 'Admin', email: 'admin@test.com', password: hash, role: 'admin', isVerified: true })
  const a1 = await User.create({ name: 'Attendee One', email: 'a1@test.com', password: hash, role: 'attendee', isVerified: true })
  const a2 = await User.create({ name: 'Attendee Two', email: 'a2@test.com', password: hash, role: 'attendee', isVerified: true })
  const sign = (u) => jwt.sign({ id: u._id, role: u.role, name: u.name }, process.env.JWT_SECRET, { expiresIn: '1h' })
  const adminTok = sign(admin)
  const a1Tok = sign(a1)
  const a2Tok = sign(a2)

  console.log('\nHealth & expos')
  let r = await api('GET', '/api/health')
  check('health probe', r.status === 200 && r.data.ok === true)

  r = await api('POST', '/api/expos', {
    token: adminTok,
    body: { title: 'Smoke Expo', date: '2030-01-01', location: 'Hall A', lat: 1, lng: 2, theme: 'Test', description: 'desc' }
  })
  check('admin creates expo (201)', r.status === 201, JSON.stringify(r.data))
  const expoId = r.data._id

  r = await api('GET', '/api/expos?page=1&limit=9')
  check('expos paginated shape', r.status === 200 && Array.isArray(r.data.items) && r.data.items.length === 1 && typeof r.data.pages === 'number')

  r = await api('GET', '/api/exhibitors?page=1&limit=9')
  check('exhibitors paginated shape', r.status === 200 && Array.isArray(r.data.items) && typeof r.data.pages === 'number')

  r = await api('GET', '/api/exhibitors')
  check('exhibitors plain array without page', r.status === 200 && Array.isArray(r.data))

  console.log('\nSessions, conflicts & capacity')
  r = await api('POST', '/api/sessions', {
    token: adminTok,
    body: {
      expo: expoId, title: 'Keynote', speaker: 'Dr X', location: 'Hall A', capacity: 1,
      startTime: '2030-01-01T10:00:00.000Z', endTime: '2030-01-01T11:00:00.000Z'
    }
  })
  check('admin creates session (201)', r.status === 201, JSON.stringify(r.data))
  const sessionId = r.data._id

  r = await api('POST', '/api/sessions', {
    token: adminTok,
    body: {
      expo: expoId, title: 'Clash', speaker: 'Dr Y', location: 'Hall A', capacity: 5,
      startTime: '2030-01-01T10:30:00.000Z', endTime: '2030-01-01T11:30:00.000Z'
    }
  })
  check('overlapping hall session blocked (409)', r.status === 409, JSON.stringify(r.data))

  console.log('\nBooking & waitlist')
  r = await api('POST', `/api/sessions/${sessionId}/book`, { token: a1Tok })
  check('attendee books a seat (201)', r.status === 201, JSON.stringify(r.data))

  r = await api('POST', `/api/sessions/${sessionId}/book`, { token: a2Tok })
  check('full session rejects booking (409, full)', r.status === 409 && r.data.full === true, JSON.stringify(r.data))

  r = await api('POST', `/api/sessions/${sessionId}/waitlist`, { token: a2Tok })
  check('attendee joins waitlist (201)', r.status === 201, JSON.stringify(r.data))

  r = await api('GET', '/api/sessions/waitlist/me', { token: a2Tok })
  check('waitlist/me lists entry', r.status === 200 && r.data.length === 1)

  r = await api('GET', '/api/sessions/bookings/me', { token: a1Tok })
  const bookingId = r.data[0]._id
  r = await api('DELETE', `/api/sessions/bookings/${bookingId}`, { token: a1Tok })
  check('attendee cancels booking (200)', r.status === 200, JSON.stringify(r.data))

  r = await api('GET', '/api/sessions/bookings/me', { token: a2Tok })
  check('waitlisted user auto-promoted to booking', r.status === 200 && r.data.length === 1)

  r = await api('GET', '/api/sessions/waitlist/me', { token: a2Tok })
  check('promoted user removed from waitlist', r.status === 200 && r.data.length === 0)

  console.log('\nFavourites')
  r = await api('POST', '/api/favourites', { token: a1Tok, body: { expo: expoId } })
  check('save expo (201)', r.status === 201, JSON.stringify(r.data))
  r = await api('GET', '/api/favourites/ids', { token: a1Tok })
  check('favourite ids include expo', r.status === 200 && r.data.includes(expoId))
  r = await api('DELETE', `/api/favourites/${expoId}`, { token: a1Tok })
  check('remove favourite (200)', r.status === 200)

  console.log('\nAdmin user management')
  r = await api('GET', '/api/admin/users?page=1&limit=10', { token: adminTok })
  check('users list paginated', r.status === 200 && Array.isArray(r.data.items) && r.data.items.length >= 3)
  r = await api('PATCH', `/api/admin/users/${a1._id}`, { token: adminTok, body: { role: 'exhibitor' } })
  check('change user role', r.status === 200 && r.data.role === 'exhibitor')
  r = await api('PATCH', `/api/admin/users/${a1._id}`, { token: adminTok, body: { blocked: true } })
  check('block user', r.status === 200 && r.data.blocked === true)
  r = await api('PATCH', `/api/admin/users/${admin._id}`, { token: adminTok, body: { blocked: true } })
  check('admin cannot block self (400)', r.status === 400)
  r = await api('GET', '/api/admin/users')
  check('admin route requires token (401)', r.status === 401)
  r = await api('GET', '/api/admin/users', { token: a2Tok })
  check('admin route forbids attendee (403)', r.status === 403)

  console.log('\nFeedback & analytics')
  r = await api('POST', '/api/feedback', { token: a2Tok, body: { message: 'Great event', type: 'suggestion' } })
  check('submit feedback (201)', r.status === 201)
  r = await api('GET', '/api/feedback?page=1&limit=10', { token: adminTok })
  check('feedback list paginated', r.status === 200 && Array.isArray(r.data.items) && r.data.items.length === 1)
  r = await api('GET', `/api/expos/${expoId}/analytics`, { token: adminTok })
  check('analytics per-session breakdown', r.status === 200 && Array.isArray(r.data.bookingsBySession) && r.data.bookingsBySession[0]?.title === 'Keynote')
  r = await api('GET', `/api/expos/${expoId}/bookings`, { token: adminTok })
  check('expo bookings report endpoint', r.status === 200 && r.data.length === 1)

  console.log('\nReal-time feed & image uploads')
  r = await api('GET', '/api/events')
  check('change feed responds', r.status === 200 && Array.isArray(r.data.changes) && typeof r.data.now === 'string')

  // Upload a tiny 1x1 PNG and confirm it is stored in GridFS and served back —
  // this is the path that replaces local-disk uploads on serverless hosts.
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
  const form = new FormData()
  form.append('image', new Blob([pngBytes], { type: 'image/png' }), 'tiny.png')
  const upRes = await fetch(`${BASE}/api/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${a1Tok}` },
    body: form
  })
  let upData = null
  try { upData = await upRes.json() } catch { /* no body */ }
  check('image upload stored (201)', upRes.status === 201 && /^\/api\/images\//.test(upData?.url || ''), JSON.stringify(upData))

  if (upData?.url) {
    const imgRes = await fetch(BASE + upData.url)
    const type = imgRes.headers.get('content-type') || ''
    check('uploaded image served from GridFS', imgRes.status === 200 && type.includes('image/png'), type)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  await mongoose.disconnect()
  await mongod.stop()
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error('SMOKE TEST ERROR:', err)
  process.exit(1)
})
