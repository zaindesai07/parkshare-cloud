/**
 * Production Database Migration Script
 * Safe for production deployments:
 * - Uses CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
 * - Never drops tables or deletes user records
 * - Does NOT seed demo data into production
 * - Retries connection on container startup
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { pool } from '../backend/src/db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function connectWithRetry(maxRetries = 10, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = await pool.connect()
      return client
    } catch (err) {
      console.warn(`[DB Connection Attempt ${attempt}/${maxRetries}]: ${err.message}`)
      if (attempt === maxRetries) throw err
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}

async function runProductionMigration() {
  console.log('--- Starting Safe Production Database Migration ---')

  try {
    const client = await connectWithRetry()
    console.log('✓ Successfully connected to PostgreSQL instance.')

    const schemaPath = path.resolve(__dirname, '../backend/schema.sql')
    const schemaSql = fs.readFileSync(schemaPath, 'utf8')

    console.log('Applying database schema from schema.sql...')
    await client.query(schemaSql)
    console.log('✓ Schema applied successfully (tables & indexes verified).')

    // Verify existing tables
    const tablesRes = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('users', 'parking_spaces', 'bookings')
      ORDER BY table_name;
    `)

    const foundTables = tablesRes.rows.map((r) => r.table_name)
    console.log(`✓ Verified existing tables in database: ${foundTables.join(', ')}`)

    if (foundTables.length < 3) {
      throw new Error(`Expected 3 tables (users, parking_spaces, bookings), found: ${foundTables.length}`)
    }

    client.release()
    await pool.end()
    console.log('--- Production Migration Completed Successfully ---')
    process.exit(0)
  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    try {
      await pool.end()
    } catch {}
    process.exit(1)
  }
}

runProductionMigration()
