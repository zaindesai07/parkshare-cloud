/**
 * Production Database Migration Script
 * Safe for production deployments:
 * - Uses CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
 * - Never drops tables or deletes user records
 * - Does NOT seed demo data into production
 */
import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const { Pool } = pg
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function runProductionMigration() {
  console.log('--- Starting Safe Production Database Migration ---')

  const connectionString = process.env.DATABASE_URL
  const poolConfig = connectionString
    ? {
        connectionString,
        ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || 'parkshare',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      }

  const pool = new Pool(poolConfig)

  try {
    const client = await pool.connect()
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
    await pool.end()
    process.exit(1)
  }
}

runProductionMigration()
