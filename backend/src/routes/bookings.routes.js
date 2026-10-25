import { Router } from 'express'
import { pool } from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { sendBookingAlert, sendCancellationAlert, safeDispatchNotification } from '../services/sns.service.js'
import { syncCompletedBookings } from '../services/booking-lifecycle.service.js'

export const bookingsRouter = Router()

// All booking operations require an authenticated user
bookingsRouter.use(authenticate)

function formatBooking(row) {
  return {
    id: Number(row.id),
    parking_space_id: Number(row.parking_space_id),
    driver_id: Number(row.driver_id),
    start_time: row.start_time,
    end_time: row.end_time,
    total_price: Number(row.total_price),
    status: row.status,
    created_at: row.created_at,
    space_title: row.space_title || undefined,
    space_address: row.space_address || undefined,
    hourly_price: row.hourly_price !== undefined ? Number(row.hourly_price) : undefined,
    image_key: row.image_key || undefined,
    driver_name: row.driver_name || undefined,
    driver_email: row.driver_email || undefined,
    owner_name: row.owner_name || undefined,
    owner_email: row.owner_email || undefined,
  }
}

/**
 * POST /api/bookings
 * Create a new booking with overlap prevention and transactional locking.
 */
bookingsRouter.post('/', async (req, res, next) => {
  const { parking_space_id, start_time, end_time } = req.body

  if (!parking_space_id || isNaN(Number(parking_space_id))) {
    return res.status(400).json({ error: 'A valid parking_space_id is required.' })
  }

  if (!start_time || !end_time) {
    return res.status(400).json({ error: 'start_time and end_time are required.' })
  }

  const start = new Date(start_time)
  const end = new Date(end_time)

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({ error: 'Invalid start_time or end_time date format.' })
  }

  if (end <= start) {
    return res.status(400).json({ error: 'end_time must be strictly after start_time.' })
  }

  // Prevent booking in the past (allowing 5 minutes clock drift)
  const nowWithGrace = new Date(Date.now() - 5 * 60 * 1000)
  if (start < nowWithGrace) {
    return res.status(400).json({ error: 'Reservation start_time cannot be in the past.' })
  }

  const spaceId = Number(parking_space_id)
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // 1. Lock the parking space row to serialize concurrent booking attempts
    const spaceRes = await client.query(
      `SELECT id, title, address, hourly_price, is_active, owner_id, image_key
       FROM parking_spaces
       WHERE id = $1
       FOR UPDATE`,
      [spaceId]
    )

    if (spaceRes.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Parking space not found.' })
    }

    const space = spaceRes.rows[0]

    if (Number(space.owner_id) === Number(req.user.id)) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'You cannot book your own parking space.' })
    }

    if (!space.is_active) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Parking space is currently inactive and cannot be booked.' })
    }

    // 2. Check for overlapping confirmed bookings
    const conflictRes = await client.query(
      `SELECT id, start_time, end_time
       FROM bookings
       WHERE parking_space_id = $1
         AND status = 'confirmed'
         AND start_time < $3
         AND end_time > $2`,
      [spaceId, start.toISOString(), end.toISOString()]
    )

    if (conflictRes.rows.length > 0) {
      await client.query('ROLLBACK')
      return res.status(409).json({
        error: 'This parking space is already booked for the selected time window.',
        conflict: {
          booking_id: Number(conflictRes.rows[0].id),
          start_time: conflictRes.rows[0].start_time,
          end_time: conflictRes.rows[0].end_time,
        },
      })
    }

    // 3. Compute total price based on duration in hours
    const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
    const hourlyPrice = Number(space.hourly_price)
    const totalPrice = Math.round(durationHours * hourlyPrice * 100) / 100

    // 4. Insert confirmed booking
    const insertRes = await client.query(
      `INSERT INTO bookings (parking_space_id, driver_id, start_time, end_time, total_price, status)
       VALUES ($1, $2, $3, $4, $5, 'confirmed')
       RETURNING id, parking_space_id, driver_id, start_time, end_time, total_price, status, created_at`,
      [spaceId, req.user.id, start.toISOString(), end.toISOString(), totalPrice]
    )

    await client.query('COMMIT')

    const createdBooking = {
      ...formatBooking(insertRes.rows[0]),
      space_title: space.title,
      space_address: space.address,
      hourly_price: hourlyPrice,
      image_key: space.image_key,
    }

    // Trigger asynchronous, retry-safe SNS booking confirmation
    safeDispatchNotification(() => sendBookingAlert(createdBooking))

    return res.status(201).json({
      message: 'Booking created successfully.',
      booking: createdBooking,
    })
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally {
    client.release()
  }
})

/**
 * POST /api/bookings/sync-completed
 * Programmatic / scheduled endpoint to idempotently sync past reservations to 'completed'.
 */
bookingsRouter.post('/sync-completed', async (req, res, next) => {
  try {
    const result = await syncCompletedBookings()
    return res.status(200).json({
      message: 'Booking status synchronization completed successfully.',
      ...result,
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/bookings
 * Retrieve bookings for the authenticated user (as driver, or as space owner if ?as=owner).
 */
bookingsRouter.get('/', async (req, res, next) => {
  try {
    // Automatically transition past confirmed bookings to completed
    await syncCompletedBookings()

    const { as } = req.query

    if (as === 'owner') {
      const result = await pool.query(
        `SELECT 
          b.id, b.parking_space_id, b.driver_id, b.start_time, b.end_time, b.total_price, b.status, b.created_at,
          p.title AS space_title, p.address AS space_address, p.hourly_price, p.image_key,
          u.name AS driver_name, u.email AS driver_email
         FROM bookings b
         JOIN parking_spaces p ON b.parking_space_id = p.id
         JOIN users u ON b.driver_id = u.id
         WHERE p.owner_id = $1
         ORDER BY b.start_time DESC`,
        [req.user.id]
      )
      return res.status(200).json({
        total: result.rows.length,
        bookings: result.rows.map(formatBooking),
      })
    }

    // Default: return user's bookings as driver
    const result = await pool.query(
      `SELECT 
        b.id, b.parking_space_id, b.driver_id, b.start_time, b.end_time, b.total_price, b.status, b.created_at,
        p.title AS space_title, p.address AS space_address, p.hourly_price, p.image_key,
        o.name AS owner_name, o.email AS owner_email
       FROM bookings b
       JOIN parking_spaces p ON b.parking_space_id = p.id
       JOIN users o ON p.owner_id = o.id
       WHERE b.driver_id = $1
       ORDER BY b.start_time DESC`,
      [req.user.id]
    )

    return res.status(200).json({
      total: result.rows.length,
      bookings: result.rows.map(formatBooking),
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/bookings/:id
 * Retrieve single booking by ID.
 */
bookingsRouter.get('/:id', async (req, res, next) => {
  try {
    const bookingId = Number(req.params.id)
    if (!bookingId || isNaN(bookingId)) {
      return res.status(400).json({ error: 'Invalid booking ID' })
    }

    const result = await pool.query(
      `SELECT 
        b.id, b.parking_space_id, b.driver_id, b.start_time, b.end_time, b.total_price, b.status, b.created_at,
        p.title AS space_title, p.address AS space_address, p.hourly_price, p.image_key, p.owner_id,
        u.name AS driver_name, u.email AS driver_email,
        o.name AS owner_name, o.email AS owner_email
       FROM bookings b
       JOIN parking_spaces p ON b.parking_space_id = p.id
       JOIN users u ON b.driver_id = u.id
       JOIN users o ON p.owner_id = o.id
       WHERE b.id = $1`,
      [bookingId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found.' })
    }

    const bookingRow = result.rows[0]
    const isDriver = Number(bookingRow.driver_id) === Number(req.user.id)
    const isOwner = Number(bookingRow.owner_id) === Number(req.user.id)
    const isAdmin = req.user.role === 'admin'

    if (!isDriver && !isOwner && !isAdmin) {
      return res.status(403).json({ error: 'You do not have permission to view this booking.' })
    }

    return res.status(200).json({
      booking: formatBooking(bookingRow),
    })
  } catch (error) {
    next(error)
  }
})

/**
 * PATCH /api/bookings/:id/cancel
 * Cancel a confirmed booking (permitted for driver who booked, or space owner).
 */
bookingsRouter.patch('/:id/cancel', async (req, res, next) => {
  try {
    const bookingId = Number(req.params.id)
    if (!bookingId || isNaN(bookingId)) {
      return res.status(400).json({ error: 'Invalid booking ID' })
    }

    const result = await pool.query(
      `SELECT b.id, b.driver_id, b.start_time, b.end_time, b.total_price, b.status, p.owner_id, p.title AS space_title
       FROM bookings b
       JOIN parking_spaces p ON b.parking_space_id = p.id
       WHERE b.id = $1`,
      [bookingId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found.' })
    }

    const booking = result.rows[0]
    const isDriver = Number(booking.driver_id) === Number(req.user.id)
    const isOwner = Number(booking.owner_id) === Number(req.user.id)
    const isAdmin = req.user.role === 'admin'

    if (!isDriver && !isOwner && !isAdmin) {
      return res.status(403).json({ error: 'You do not have permission to cancel this booking.' })
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ error: 'Booking is already cancelled.' })
    }

    if (booking.status === 'completed') {
      return res.status(400).json({ error: 'Completed bookings cannot be cancelled.' })
    }

    if (new Date(booking.end_time) <= new Date()) {
      return res.status(400).json({ error: 'Past or ended reservations cannot be cancelled.' })
    }

    const updateRes = await pool.query(
      `UPDATE bookings
       SET status = 'cancelled'
       WHERE id = $1
       RETURNING id, parking_space_id, driver_id, start_time, end_time, total_price, status, created_at`,
      [bookingId]
    )

    const cancelledBooking = {
      ...formatBooking(updateRes.rows[0]),
      space_title: booking.space_title,
    }

    // Trigger asynchronous, retry-safe SNS cancellation alert
    safeDispatchNotification(() => sendCancellationAlert(cancelledBooking))

    return res.status(200).json({
      message: 'Booking cancelled successfully.',
      booking: cancelledBooking,
    })
  } catch (error) {
    next(error)
  }
})
