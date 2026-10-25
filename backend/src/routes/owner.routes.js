import { Router } from 'express'
import { pool } from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { generatePresignedUploadUrl, isValidSpaceImageKey } from '../services/s3.service.js'

export const ownerRouter = Router()

// All owner routes require authentication
ownerRouter.use(authenticate)

/**
 * POST /api/owner/spaces/upload-url
 * Generate an AWS S3 presigned upload URL for a space photo.
 */
ownerRouter.post('/upload-url', async (req, res, next) => {
  try {
    const { filename, contentType, fileSize } = req.body

    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({ error: 'filename is required.' })
    }

    if (!contentType || typeof contentType !== 'string') {
      return res.status(400).json({ error: 'contentType is required (e.g. image/jpeg, image/png).' })
    }

    const result = await generatePresignedUploadUrl({
      filename,
      contentType,
      fileSize,
      ownerId: req.user.id,
    })

    return res.status(200).json(result)
  } catch (error) {
    if (
      error.message.includes('Invalid file type') ||
      error.message.includes('File size') ||
      error.message.includes('Invalid file size')
    ) {
      return res.status(400).json({ error: error.message })
    }
    next(error)
  }
})

function formatSpace(row) {
  return {
    id: Number(row.id),
    owner_id: Number(row.owner_id),
    title: row.title,
    description: row.description,
    address: row.address,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    hourly_price: Number(row.hourly_price),
    image_key: row.image_key,
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
    active_bookings: row.active_bookings !== undefined ? Number(row.active_bookings) : undefined,
  }
}

/**
 * GET /api/owner/spaces
 * Retrieve all parking spaces managed by the current user.
 */
ownerRouter.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT 
        p.id, p.owner_id, p.title, p.description, p.address,
        p.latitude, p.longitude, p.hourly_price, p.image_key,
        p.is_active, p.created_at,
        COUNT(b.id) FILTER (WHERE b.status = 'confirmed' AND b.end_time > NOW()) AS active_bookings
       FROM parking_spaces p
       LEFT JOIN bookings b ON p.id = b.parking_space_id
       WHERE p.owner_id = $1
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [req.user.id]
    )

    return res.status(200).json({
      spaces: result.rows.map(formatSpace),
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/owner/spaces
 * Create a new parking space listing.
 */
ownerRouter.post('/', async (req, res, next) => {
  try {
    const {
      title,
      description,
      address,
      latitude = 19.07609,
      longitude = 72.877426,
      hourly_price,
      image_key,
      is_active = true,
    } = req.body

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Title is required (max 150 characters).' })
    }
    if (title.trim().length > 150) {
      return res.status(400).json({ error: 'Title cannot exceed 150 characters.' })
    }

    if (!address || typeof address !== 'string' || !address.trim()) {
      return res.status(400).json({ error: 'Address is required.' })
    }

    const priceNum = Number(hourly_price)
    if (hourly_price === undefined || isNaN(priceNum) || priceNum < 0) {
      return res.status(400).json({ error: 'Hourly price must be a non-negative number.' })
    }

    const latNum = Number(latitude)
    const lngNum = Number(longitude)
    if (isNaN(latNum) || isNaN(lngNum)) {
      return res.status(400).json({ error: 'Latitude and longitude must be valid numbers.' })
    }

    // Security validation: prevent arbitrary or unauthorized S3 object keys
    if (image_key && !isValidSpaceImageKey(image_key, req.user.id, req.user.role === 'admin')) {
      return res.status(400).json({
        error: 'Invalid or unauthorized image_key. Must be a standard icon or authorized S3 photo path.',
      })
    }

    // If user's role is currently 'driver', upgrade them to 'owner'
    if (req.user.role === 'driver') {
      await pool.query("UPDATE users SET role = 'owner' WHERE id = $1", [req.user.id])
    }

    const insertResult = await pool.query(
      `INSERT INTO parking_spaces 
        (owner_id, title, description, address, latitude, longitude, hourly_price, image_key, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        req.user.id,
        title.trim(),
        description ? description.trim() : null,
        address.trim(),
        latNum,
        lngNum,
        priceNum,
        image_key || null,
        Boolean(is_active),
      ]
    )

    return res.status(201).json({
      message: 'Parking space created successfully',
      space: formatSpace(insertResult.rows[0]),
    })
  } catch (error) {
    next(error)
  }
})

/**
 * PUT /api/owner/spaces/:id
 * Update an existing parking space.
 */
ownerRouter.put('/:id', async (req, res, next) => {
  try {
    const spaceId = Number(req.params.id)
    if (!spaceId || isNaN(spaceId)) {
      return res.status(400).json({ error: 'Invalid space ID' })
    }

    // Verify ownership
    const spaceCheck = await pool.query(
      'SELECT id, owner_id FROM parking_spaces WHERE id = $1',
      [spaceId]
    )

    if (spaceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Parking space not found.' })
    }

    if (Number(spaceCheck.rows[0].owner_id) !== Number(req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You do not have permission to edit this space.' })
    }

    const {
      title,
      description,
      address,
      latitude,
      longitude,
      hourly_price,
      image_key,
      is_active,
    } = req.body

    const updates = []
    const params = [spaceId]

    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim() || title.length > 150) {
        return res.status(400).json({ error: 'Title must be 1-150 characters.' })
      }
      params.push(title.trim())
      updates.push(`title = $${params.length}`)
    }

    if (description !== undefined) {
      params.push(description ? description.trim() : null)
      updates.push(`description = $${params.length}`)
    }

    if (address !== undefined) {
      if (typeof address !== 'string' || !address.trim()) {
        return res.status(400).json({ error: 'Address cannot be empty.' })
      }
      params.push(address.trim())
      updates.push(`address = $${params.length}`)
    }

    if (hourly_price !== undefined) {
      const priceNum = Number(hourly_price)
      if (isNaN(priceNum) || priceNum < 0) {
        return res.status(400).json({ error: 'Hourly price must be a non-negative number.' })
      }
      params.push(priceNum)
      updates.push(`hourly_price = $${params.length}`)
    }

    if (latitude !== undefined) {
      const latNum = Number(latitude)
      if (isNaN(latNum)) return res.status(400).json({ error: 'Invalid latitude' })
      params.push(latNum)
      updates.push(`latitude = $${params.length}`)
    }

    if (longitude !== undefined) {
      const lngNum = Number(longitude)
      if (isNaN(lngNum)) return res.status(400).json({ error: 'Invalid longitude' })
      params.push(lngNum)
      updates.push(`longitude = $${params.length}`)
    }

    if (image_key !== undefined) {
      if (
        image_key !== null &&
        !isValidSpaceImageKey(image_key, spaceCheck.rows[0].owner_id, req.user.role === 'admin')
      ) {
        return res.status(400).json({
          error: 'Invalid or unauthorized image_key. Must be a standard icon or authorized S3 photo path.',
        })
      }
      params.push(image_key || null)
      updates.push(`image_key = $${params.length}`)
    }

    if (is_active !== undefined) {
      params.push(Boolean(is_active))
      updates.push(`is_active = $${params.length}`)
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields provided for update.' })
    }

    const updateSql = `
      UPDATE parking_spaces
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING *
    `

    const updateResult = await pool.query(updateSql, params)

    return res.status(200).json({
      message: 'Parking space updated successfully',
      space: formatSpace(updateResult.rows[0]),
    })
  } catch (error) {
    next(error)
  }
})

/**
 * DELETE /api/owner/spaces/:id
 * Deactivate parking space (soft delete to preserve booking history).
 */
ownerRouter.delete('/:id', async (req, res, next) => {
  try {
    const spaceId = Number(req.params.id)
    if (!spaceId || isNaN(spaceId)) {
      return res.status(400).json({ error: 'Invalid space ID' })
    }

    const spaceCheck = await pool.query(
      'SELECT id, owner_id FROM parking_spaces WHERE id = $1',
      [spaceId]
    )

    if (spaceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Parking space not found.' })
    }

    if (Number(spaceCheck.rows[0].owner_id) !== Number(req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You do not have permission to delete this space.' })
    }

    await pool.query(
      'UPDATE parking_spaces SET is_active = FALSE WHERE id = $1',
      [spaceId]
    )

    return res.status(200).json({
      message: 'Parking space deactivated successfully.',
    })
  } catch (error) {
    next(error)
  }
})
