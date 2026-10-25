import jwt from 'jsonwebtoken'

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable must be set in production mode.')
}

const JWT_SECRET = process.env.JWT_SECRET || 'parkshare_jwt_dev_super_secret_key_2026'

/**
 * Generate a signed JWT token for an authenticated user.
 */
export function generateToken(user) {
  return jwt.sign(
    {
      id: Number(user.id),
      email: user.email,
      role: user.role,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  )
}

/**
 * Authenticate incoming request via Bearer token.
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required. Missing or malformed Bearer token.',
    })
  }

  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch (err) {
    return res.status(401).json({
      error: 'Invalid or expired authentication token.',
      details: err.message,
    })
  }
}

/**
 * Optional authentication middleware: attaches req.user if a valid token is provided,
 * but allows the request to continue if no token is provided.
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null
    return next()
  }

  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
  } catch {
    req.user = null
  }
  next()
}

/**
 * Role-based authorization middleware.
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' })
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden. Role '${req.user.role}' does not have permission for this action.`,
      })
    }
    next()
  }
}
