// Small shared validation / sanitising helpers used by the routes.

// Purpose: Basic email format check.
const isEmail = (value) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())

// Purpose: Trims a value and enforces a minimum length.
const minLen = (value, length) => typeof value === 'string' && value.trim().length >= length

// Purpose: Copies only whitelisted keys from a request body so callers cannot
// inject extra database fields (mass-assignment protection).
const pick = (body = {}, keys = []) => {
  const out = {}
  keys.forEach((key) => {
    if (body[key] !== undefined) out[key] = body[key]
  })
  return out
}

// Purpose: Escapes user text before it is used inside a RegExp (ReDoS safety).
const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

module.exports = { isEmail, minLen, pick, escapeRegex }
