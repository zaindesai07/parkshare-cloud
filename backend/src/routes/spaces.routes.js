import { Router } from 'express'
import { pool } from '../db.js'

export const spacesRouter = Router()

/**
 * Format a database row into a structured space response.
 */
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
    owner_name: row.owner_name || null,
  }
}

/**
 * GET /api/spaces
 * Public listing of active parking spaces with optional search & price filters.
 */
spacesRouter.get('/', async (req, res, next) => {
  try {
    const {
      search,
      location,
      min_price,
      max_price,
      start_time,
      end_time,
      limit = 50,
      offset = 0,
    } = req.query

    const conditions = ['p.is_active = TRUE']
    const params = []

    // Keyword search across title, address, description
    if (search && typeof search === 'string' && search.trim() !== '') {
      params.push(`%${search.trim()}%`)
      conditions.push(
        `(p.title ILIKE $${params.length} OR p.address ILIKE $${params.length} OR p.description ILIKE $${params.length})`
      )
    }

    // Explicit location search
    if (location && typeof location === 'string' && location.trim() !== '') {
      params.push(`%${location.trim()}%`)
      conditions.push(`(p.address ILIKE $${params.length} OR p.title ILIKE $${params.length})`)
    }

    // Price range filters
    if (min_price !== undefined && min_price !== '' && !isNaN(Number(min_price))) {
      params.push(Number(min_price))
      conditions.push(`p.hourly_price >= $${params.length}`)
    }

    if (max_price !== undefined && max_price !== '' && !isNaN(Number(max_price))) {
      params.push(Number(max_price))
      conditions.push(`p.hourly_price <= $${params.length}`)
    }

    // Availability filter for specific time window
    if (start_time && end_time) {
      const start = new Date(start_time)
      const end = new Date(end_time)
      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
        params.push(start.toISOString())
        const startParamIdx = params.length
        params.push(end.toISOString())
        const endParamIdx = params.length
        conditions.push(`NOT EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.parking_space_id = p.id
            AND b.status = 'confirmed'
            AND b.start_time < $${endParamIdx}
            AND b.end_time > $${startParamIdx}
        )`)
      }
    }

    const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 100)
    const safeOffset = Math.max(0, Number(offset) || 0)

    params.push(safeLimit)
    const limitIdx = params.length
    params.push(safeOffset)
    const offsetIdx = params.length

    const sql = `
      SELECT 
        p.id, p.owner_id, p.title, p.description, p.address,
        p.latitude, p.longitude, p.hourly_price, p.image_key,
        p.is_active, p.created_at,
        u.name AS owner_name
      FROM parking_spaces p
      JOIN users u ON p.owner_id = u.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.id ASC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `

    const result = await pool.query(sql, params)
    const spaces = result.rows.map(formatSpace)

    return res.status(200).json({
      total: spaces.length,
      spaces,
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/spaces/:id
 * Retrieve details of a single parking space by ID.
 */
spacesRouter.get('/:id', async (req, res, next) => {
  try {
    const spaceId = Number(req.params.id)
    if (!spaceId || isNaN(spaceId)) {
      return res.status(400).json({ error: 'Invalid space ID' })
    }

    const result = await pool.query(
      `SELECT 
        p.id, p.owner_id, p.title, p.description, p.address,
        p.latitude, p.longitude, p.hourly_price, p.image_key,
        p.is_active, p.created_at,
        u.name AS owner_name
       FROM parking_spaces p
       JOIN users u ON p.owner_id = u.id
       WHERE p.id = $1`,
      [spaceId]
    )

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(404).json({ error: 'Parking space not found or is no longer available.' })
    }

    return res.status(200).json({
      space: formatSpace(result.rows[0]),
    })
  } catch (error) {
    next(error)
  }
})
