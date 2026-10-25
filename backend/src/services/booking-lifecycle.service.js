import { pool } from '../db.js'

/**
 * Idempotently mark eligible past reservations as 'completed'.
 *
 * Rules:
 * 1. Only transitions bookings with status = 'confirmed'.
 * 2. Only transitions bookings where end_time <= NOW() (never completes active/future bookings).
 * 3. Safe to call concurrently or repeatedly with zero side effects.
 */
export async function syncCompletedBookings() {
  try {
    const result = await pool.query(`
      UPDATE bookings
      SET status = 'completed'
      WHERE status = 'confirmed'
        AND end_time <= NOW()
      RETURNING id, parking_space_id, driver_id, end_time
    `)

    if (result.rows.length > 0) {
      console.log(`[Booking Lifecycle] Marked ${result.rows.length} past reservation(s) as completed.`)
    }

    return {
      success: true,
      updatedCount: result.rows.length,
      completedIds: result.rows.map((r) => Number(r.id)),
    }
  } catch (error) {
    console.error('[Booking Lifecycle Error] Failed to sync completed bookings:', error.message)
    return {
      success: false,
      updatedCount: 0,
      completedIds: [],
      error: error.message,
    }
  }
}
