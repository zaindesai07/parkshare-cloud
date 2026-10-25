/**
 * Lightweight in-memory rate limiting middleware.
 * Guards sensitive auth endpoints against brute-force and credential stuffing attacks.
 */
export function createRateLimiter({
  windowMs = 60 * 1000,
  max = 20,
  message = 'Too many requests from this IP, please try again later.',
} = {}) {
  const store = new Map()

  // Periodically purge stale entries every 5 minutes
  const cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [key, record] of store.entries()) {
      if (now > record.resetTime) {
        store.delete(key)
      }
    }
  }, 5 * 60 * 1000)

  // Don't keep the Node.js event loop alive solely for cleanup
  if (cleanupInterval.unref) {
    cleanupInterval.unref()
  }

  return (req, res, next) => {
    // Disable in test environment if explicit flag set
    if (process.env.DISABLE_RATE_LIMIT === 'true') {
      return next()
    }

    const ip =
      req.headers['x-forwarded-for']?.split(',')[0].trim() ||
      req.socket.remoteAddress ||
      'unknown-ip'

    const now = Date.now()
    let record = store.get(ip)

    if (!record || now > record.resetTime) {
      record = {
        count: 0,
        resetTime: now + windowMs,
      }
      store.set(ip, record)
    }

    record.count += 1
    const remaining = Math.max(0, max - record.count)
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000)

    res.setHeader('RateLimit-Limit', max)
    res.setHeader('RateLimit-Remaining', remaining)
    res.setHeader('RateLimit-Reset', resetSeconds)

    if (record.count > max) {
      res.setHeader('Retry-After', resetSeconds)
      return res.status(429).json({
        error: message,
        retryAfterSeconds: resetSeconds,
      })
    }

    next()
  }
}
