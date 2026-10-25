import pg from 'pg'

const { Pool } = pg

const isSslEnabled =
  process.env.DB_SSL === 'true' ||
  (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('sslmode=require'))

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: isSslEnabled ? { rejectUnauthorized: false } : undefined,
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME || 'parkshare',
      user: process.env.DB_USER || process.env.USER,
      password: process.env.DB_PASSWORD || undefined,
      ssl: isSslEnabled ? { rejectUnauthorized: false } : undefined,
    }

export const pool = new Pool({
  ...poolConfig,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 10,
})

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error.message)
})
