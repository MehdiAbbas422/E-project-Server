require('dotenv').config()
require('express-async-errors') // forwards async route errors to the error handler
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const http = require('http')
const path = require('path')
const jwt = require('jsonwebtoken')
const { Server } = require('socket.io')
const connectDB = require('./config/db')

const app = express()
connectDB()

if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET is not set — copy server/.env.example to server/.env and set it.')
}

app.use(cors())
// Security headers. crossOriginResourcePolicy is relaxed so uploaded images
// can still be embedded by the client.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
// Larger JSON body limit so image metadata can travel with form payloads
app.use(express.json({ limit: '2mb' }))

// Purpose: Basic abuse protection — a general API limiter plus a stricter
// limiter for sensitive authentication endpoints (anti brute-force).
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false
})
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts, please try again later.' }
})
app.use('/api', generalLimiter)
;['register', 'login', 'verify-otp', 'resend-otp', 'forgot-password', 'reset-password']
  .forEach((path) => app.use(`/api/auth/${path}`, authLimiter))

// Purpose: Serves the JPG/PNG files uploaded through /api/upload
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// Route modules - each route file documents the purpose of its handlers
app.use('/api/auth', require('./routes/auth'))
app.use('/api/expos', require('./routes/expos'))
app.use('/api/booths', require('./routes/booths'))
app.use('/api/sessions', require('./routes/sessions'))
app.use('/api/exhibitors', require('./routes/exhibitors'))
app.use('/api/feedback', require('./routes/feedback'))
app.use('/api/upload', require('./routes/upload'))
app.use('/api/notifications', require('./routes/notifications'))
app.use('/api/announcements', require('./routes/announcements'))
app.use('/api/enquiries', require('./routes/enquiries'))
app.use('/api/favourites', require('./routes/favourites'))
app.use('/api/admin', require('./routes/admin'))

// Purpose: Simple health probe used by the client to confirm the API is up.
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }))

const server = http.createServer(app)

// ---------------------------------------------------------------
// Real-time layer (Socket.IO) — pushes notifications and data-change
// events so open pages update live (real-time event information).
// ---------------------------------------------------------------
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || '*' }
})

// Purpose: Authenticates each socket connection with the same JWT used by
// the REST API and attaches the decoded user to the socket.
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token
    if (!token) return next(new Error('Authentication required'))
    socket.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    next(new Error('Invalid token'))
  }
})

// Purpose: Places each connected user in their private notification room and
// lets pages subscribe to a specific expo room for live updates.
io.on('connection', (socket) => {
  socket.join(`user:${socket.user.id}`)
  if (socket.user.role === 'admin') socket.join('admins')

  socket.on('joinExpo', (expoId) => { if (expoId) socket.join(`expo:${expoId}`) })
  socket.on('leaveExpo', (expoId) => { if (expoId) socket.leave(`expo:${expoId}`) })
})

// Make the Socket.IO instance available to the route handlers
app.set('io', io)

// Purpose: Global error handler — returns a clean JSON error instead of
// leaking a stack trace or hanging the request.
app.use((err, req, res, next) => {
  console.error('API error:', err.message)
  const status = err.status || (err.name === 'CastError' ? 400 : 500)
  const message = err.name === 'CastError' ? 'Invalid identifier' : (err.message || 'Something went wrong')
  res.status(status).json({ message })
})

const PORT = process.env.PORT || 5000
server.listen(PORT, () => console.log(`Server running on port ${PORT}`))
