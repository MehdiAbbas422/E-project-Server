const jwt = require('jsonwebtoken')

// Purpose: Global authentication guard for protected routes - reads the
// "Authorization: Bearer <token>" header, verifies the JWT and attaches the
// decoded user (id, role, name) to req.user. Rejects with 401 otherwise.
const auth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ message: 'No token, access denied' })
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ message: 'Invalid token' })
  }
}

// Purpose: Role-based authorization guard used after auth - allows the
// request only when the caller's role is one of the allowed roles,
// otherwise responds with 403.
const allow = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'Access denied' })
  next()
}

module.exports = { auth, allow }
