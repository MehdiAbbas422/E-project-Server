const router = require('express').Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const Otp = require('../models/Otp')
const sendOtp = require('../config/mailer')
const { auth } = require('../middleware/auth')
const { isEmail, minLen } = require('../utils/validate')

// Purpose: Signs a short-lived JWT that carries the user id, role and name
// so later requests can be authenticated and role-checked.
const sign = (user) => jwt.sign(
  { id: user._id, role: user.role, name: user.name },
  process.env.JWT_SECRET,
  { expiresIn: '7d' }
)

// Purpose: Strips the user object of sensitive fields (password, OTP data)
// before it is returned to the client.
const safeUser = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role })

// Purpose: Generates a 6-digit OTP, stores it hashed with an expiry,
// removes older codes for the same purpose and emails it to the user.
const createOtp = async (email, purpose) => {
  await Otp.deleteMany({ email, purpose })
  const code = String(Math.floor(100000 + Math.random() * 900000))
  const hashedCode = await bcrypt.hash(code, 10)
  await Otp.create({ email, code: hashedCode, purpose, expiresAt: Date.now() + 10 * 60 * 1000 })
  await sendOtp(email, code, purpose)
  return code
}

// Purpose: Validates an OTP submitted by the user (exists, not expired,
// matches the hash) and consumes it so it cannot be reused.
const checkOtp = async (email, code, purpose) => {
  const otp = await Otp.findOne({ email, purpose })
  if (!otp || otp.expiresAt < Date.now() || !(await bcrypt.compare(code, otp.code))) return false

  await Otp.deleteMany({ email, purpose })
  return true
}

// POST /api/auth/register
// Purpose: Creates a new user account (attendee / exhibitor / admin), rejects
// duplicate emails, hashes the password and sends an OTP to verify the email.
// Admin accounts are restricted: the very first admin can self-register, after
// that the ADMIN_SIGNUP_CODE from the environment is required.
router.post('/register', async (req, res) => {
  const { name, email, password, role = 'attendee', adminCode } = req.body

  if (!name || !minLen(name, 2)) return res.status(400).json({ message: 'Please enter your name' })
  if (!isEmail(email)) return res.status(400).json({ message: 'Please enter a valid email address' })
  if (!minLen(password, 6)) return res.status(400).json({ message: 'Password must be at least 6 characters' })
  if (!['attendee', 'exhibitor', 'admin'].includes(role))
    return res.status(400).json({ message: 'Invalid role' })

  if (role === 'admin') {
    const adminExists = await User.exists({ role: 'admin' })
    const codeOk = process.env.ADMIN_SIGNUP_CODE && adminCode === process.env.ADMIN_SIGNUP_CODE
    if (adminExists && !codeOk)
      return res.status(403).json({ message: 'Admin registration is restricted — a valid admin code is required' })
  }

  if (await User.findOne({ email: email.toLowerCase() }))
    return res.status(400).json({ message: 'Email already exists' })

  const hash = await bcrypt.hash(password, 10)
  await User.create({ name, email: email.toLowerCase(), password: hash, role, isVerified: false })
  await createOtp(email.toLowerCase(), 'verify')
  res.status(201).json({ message: 'OTP sent to your email', email: email.toLowerCase() })
})

// POST /api/auth/verify-otp
// Purpose: Confirms the email-verification OTP, marks the account as verified
// and returns a JWT together with the safe user profile so the client can log in.
router.post('/verify-otp', async (req, res) => {
  const { email, code } = req.body
  if (!isEmail(email) || !code) return res.status(400).json({ message: 'Email and code are required' })
  if (!(await checkOtp(email.toLowerCase(), code, 'verify')))
    return res.status(400).json({ message: 'Invalid or expired OTP' })
  const user = await User.findOneAndUpdate({ email: email.toLowerCase() }, { isVerified: true }, { new: true })
  if (!user) return res.status(404).json({ message: 'User not found' })
  res.json({ token: sign(user), user: safeUser(user) })
})

// POST /api/auth/resend-otp
// Purpose: Regenerates and re-emails an OTP (verification or password reset)
// for a known user when the previous code was lost or expired.
router.post('/resend-otp', async (req, res) => {
  const { email, purpose = 'verify' } = req.body
  if (!isEmail(email)) return res.status(400).json({ message: 'A valid email is required' })
  const user = await User.findOne({ email: email.toLowerCase() })
  if (!user) return res.status(404).json({ message: 'User not found' })
  await createOtp(email.toLowerCase(), purpose)
  res.json({ message: 'OTP resent' })
})

// POST /api/auth/login
// Purpose: Authenticates email + password, blocks unverified accounts by
// sending them a fresh OTP, and returns a JWT with the user profile on success.
router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!isEmail(email) || !password)
    return res.status(400).json({ message: 'Email and password are required' })

  const user = await User.findOne({ email: email.toLowerCase() })
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.status(400).json({ message: 'Invalid credentials' })
  if (user.blocked)
    return res.status(403).json({ message: 'This account has been blocked. Please contact support.' })
  if (!user.isVerified) {
    await createOtp(email.toLowerCase(), 'verify')
    return res.status(403).json({ message: 'Email not verified. OTP sent.', needsVerify: true, email })
  }
  res.json({ token: sign(user), user: safeUser(user) })
})

// POST /api/auth/forgot-password
// Purpose: Starts the password-reset flow by sending a reset OTP to the
// account email (404 if no account exists for that address).
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body
  if (!isEmail(email)) return res.status(400).json({ message: 'A valid email is required' })
  const user = await User.findOne({ email: email.toLowerCase() })
  if (!user) return res.status(404).json({ message: 'User not found' })
  await createOtp(email.toLowerCase(), 'reset')
  res.json({ message: 'OTP sent to your email', email })
})

// POST /api/auth/reset-password
// Purpose: Validates the reset OTP and stores the new hashed password,
// completing the forgot-password flow.
router.post('/reset-password', async (req, res) => {
  const { email, code, password } = req.body
  if (!isEmail(email) || !code || !minLen(password, 6))
    return res.status(400).json({ message: 'Email, code and a 6+ character password are required' })
  if (!(await checkOtp(email.toLowerCase(), code, 'reset')))
    return res.status(400).json({ message: 'Invalid or expired OTP' })
  const hash = await bcrypt.hash(password, 10)
  await User.findOneAndUpdate({ email: email.toLowerCase() }, { password: hash })
  res.json({ message: 'Password reset successful' })
})

// PATCH /api/auth/profile
// Purpose: Lets a logged-in user update their own name and, optionally,
// change their password (current password must match).
router.patch('/profile', auth, async (req, res) => {
  const { name, currentPassword, newPassword } = req.body
  const user = await User.findById(req.user.id)
  if (!user) return res.status(404).json({ message: 'User not found' })

  if (name !== undefined) {
    if (!minLen(name, 2)) return res.status(400).json({ message: 'Name is too short' })
    user.name = name
  }

  if (newPassword) {
    if (!minLen(newPassword, 6)) return res.status(400).json({ message: 'New password must be at least 6 characters' })
    if (!currentPassword || !(await bcrypt.compare(currentPassword, user.password)))
      return res.status(400).json({ message: 'Current password is incorrect' })
    user.password = await bcrypt.hash(newPassword, 10)
  }

  await user.save()
  res.json({ message: 'Profile updated', user: safeUser(user) })
})

// GET /api/auth/me
// Purpose: Returns the currently authenticated user's profile (without the
// password) so the client can restore a session from a stored token.
router.get('/me', auth, async (req, res) => {
  res.json(await User.findById(req.user.id).select('-password'))
})

module.exports = router
