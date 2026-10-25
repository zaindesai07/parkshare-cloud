
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { pool } from './db.js'
import { authRouter } from './routes/auth.routes.js'
import { spacesRouter } from './routes/spaces.routes.js'
import { ownerRouter } from './routes/owner.routes.js'
import { bookingsRouter } from './routes/bookings.routes.js'
import { syncCompletedBookings } from './services/booking-lifecycle.service.js'

const app = express()
const PORT = Number(process.env.PORT || 5050)
const HOST = process.env.HOST || '0.0.0.0'

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  next()
})

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  })
)

app.use(express.json({ limit: '1mb' }))

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    application: 'ParkShare Cloud API',
    message: 'Welcome to ParkShare Cloud',
    health: '/health',
    databaseHealth: '/api/db-health',
  })
})

// API health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    application: 'ParkShare Cloud API',
    timestamp: new Date().toISOString(),
  })
})

// PostgreSQL connection check
app.get('/api/db-health', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT current_database() AS database, current_user AS username'
    )

    res.status(200).json({
      status: 'ok',
      database: result.rows[0].database,
      connectedAs: result.rows[0].username,
    })
  } catch (error) {
    console.error('Database health check failed:', error.message)

    res.status(503).json({
      status: 'error',
      message: 'Database connection failed',
    })
  }
})

// Register modular API routes
app.use('/api/auth', authRouter)
app.use('/api/spaces', spacesRouter)
app.use('/api/owner/spaces', ownerRouter)
app.use('/api/bookings', bookingsRouter)

// Handle unknown routes
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
  })
})

// General error handler
app.use((err, req, res, next) => {
  console.error('API error:', err.message)

  if (res.headersSent) {
    return next(err)
  }

  const statusCode = err.status || err.statusCode || 500
  res.status(statusCode).json({
    error: err.message || 'Internal server error',
  })
})

// Start the server
const server = app.listen(PORT, HOST, () => {
  console.log(`ParkShare Cloud API running at http://${HOST}:${PORT}`)
  console.log(`Health check: http://${HOST}:${PORT}/health`)
  console.log(`Database check: http://${HOST}:${PORT}/api/db-health`)

  // Periodic background check to mark eligible past bookings completed every 60s
  const syncInterval = setInterval(() => {
    syncCompletedBookings().catch((err) =>
      console.warn('[Sync Interval Error]', err.message)
    )
  }, 60 * 1000)

  if (syncInterval.unref) {
    syncInterval.unref()
  }
})

// Graceful shutdown
async function shutdown() {
  console.log('\nShutting down ParkShare API...')

  server.close(async () => {
    try {
      await pool.end()
      console.log('Database connections closed.')
      process.exit(0)
    } catch (error) {
      console.error('Shutdown error:', error.message)
      process.exit(1)
    }
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
