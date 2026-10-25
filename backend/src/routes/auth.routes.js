import { Router } from 'express'
import bcrypt from 'bcrypt'
import { pool } from '../db.js'
import { authenticate, generateToken } from '../middleware/auth.js'
import { createRateLimiter } from '../middleware/rate-limiter.js'

export const authRouter = Router()

const authLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many authentication attempts from this IP. Please wait a minute before retrying.',
})

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * POST /api/auth/register
 * Register a new user (driver or owner).
 */
authRouter.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { name, email, password, role = 'driver' } = req.body

    // Basic validations
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Name is required (max 100 characters).' })
    }
    if (name.trim().length > 100) {
      return res.status(400).json({ error: 'Name cannot exceed 100 characters.' })
    }

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ error: 'A valid email address is required.' })
    }
    if (email.trim().length > 255) {
      return res.status(400).json({ error: 'Email cannot exceed 255 characters.' })
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' })
    }
    if (password.length > 128) {
      return res.status(400).json({ error: 'Password cannot exceed 128 characters.' })
    }

    const normalizedRole = role.toLowerCase()
    if (!['driver', 'owner'].includes(normalizedRole)) {
      return res.status(400).json({ error: "Role must be either 'driver' or 'owner'." })
    }

    const normalizedEmail = email.trim().toLowerCase()

    // Check if user already exists
    const existing = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [normalizedEmail]
    )
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' })
    }

    // Hash password with bcrypt
    const saltRounds = 10
    const passwordHash = await bcrypt.hash(password, saltRounds)

    // Insert user
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, created_at`,
      [name.trim(), normalizedEmail, passwordHash, normalizedRole]
    )

    const user = {
      id: Number(result.rows[0].id),
      name: result.rows[0].name,
      email: result.rows[0].email,
      role: result.rows[0].role,
      created_at: result.rows[0].created_at,
    }

    const token = generateToken(user)

    return res.status(201).json({
      message: 'User registered successfully',
      user,
      token,
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/auth/login
 * Authenticate existing user and return JWT.
 */
authRouter.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' })
    }

    const normalizedEmail = String(email).trim().toLowerCase()

    const result = await pool.query(
      `SELECT id, name, email, password_hash, role, created_at
       FROM users
       WHERE LOWER(email) = LOWER($1)`,
      [normalizedEmail]
    )

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    const row = result.rows[0]
    const passwordMatch = await bcrypt.compare(String(password), row.password_hash)

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    const user = {
      id: Number(row.id),
      name: row.name,
      email: row.email,
      role: row.role,
      created_at: row.created_at,
    }

    const token = generateToken(user)

    return res.status(200).json({
      message: 'Logged in successfully',
      user,
      token,
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/auth/me
 * Return current logged-in user details.
 */
authRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role, created_at
       FROM users
       WHERE id = $1`,
      [req.user.id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User profile not found.' })
    }

    const row = result.rows[0]
    return res.status(200).json({
      user: {
        id: Number(row.id),
        name: row.name,
        email: row.email,
        role: row.role,
        created_at: row.created_at,
      },
    })
  } catch (error) {
    next(error)
  }
})
