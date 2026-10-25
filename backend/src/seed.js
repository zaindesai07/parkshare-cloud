import 'dotenv/config'
import bcrypt from 'bcrypt'
import { pool } from './db.js'

export async function seedDatabase() {
  console.log('--- Starting ParkShare Database Seed ---')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // 1. Create or retrieve demo owner
    const ownerEmail = 'owner@parkshare.com'
    const ownerRes = await client.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [ownerEmail]
    )

    let ownerId
    if (ownerRes.rows.length === 0) {
      const passwordHash = await bcrypt.hash('Password123!', 10)
      const inserted = await client.query(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, $3, 'owner')
         RETURNING id`,
        ['Aarav Mehta', ownerEmail, passwordHash]
      )
      ownerId = inserted.rows[0].id
      console.log(`Created demo owner: ${ownerEmail} (id: ${ownerId})`)
    } else {
      ownerId = ownerRes.rows[0].id
      console.log(`Found existing demo owner: ${ownerEmail} (id: ${ownerId})`)
    }

    // 2. Create or retrieve demo driver
    const driverEmail = 'driver@parkshare.com'
    const driverRes = await client.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [driverEmail]
    )

    let driverId
    if (driverRes.rows.length === 0) {
      const passwordHash = await bcrypt.hash('Password123!', 10)
      const inserted = await client.query(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, $3, 'driver')
         RETURNING id`,
        ['Priya Sharma', driverEmail, passwordHash]
      )
      driverId = inserted.rows[0].id
      console.log(`Created demo driver: ${driverEmail} (id: ${driverId})`)
    } else {
      driverId = driverRes.rows[0].id
      console.log(`Found existing demo driver: ${driverEmail} (id: ${driverId})`)
    }

    // 3. Seed initial spaces if none exist
    const spacesCountRes = await client.query('SELECT COUNT(*) FROM parking_spaces')
    const count = Number(spacesCountRes.rows[0].count)

    if (count === 0) {
      const initialSpaces = [
        {
          title: 'Bandra West Parking',
          description: 'Covered multi-level secure parking spot near Linking Road shopping district.',
          address: 'Hill Road, Bandra West, Mumbai',
          latitude: 19.0596,
          longitude: 72.8295,
          hourly_price: 60.0,
          image_key: '🏢',
          is_active: true,
        },
        {
          title: 'BKC Secure Parking',
          description: 'Gated business district parking with 24/7 security and EV charging access.',
          address: 'G Block, Bandra Kurla Complex, Mumbai',
          latitude: 19.0688,
          longitude: 72.8687,
          hourly_price: 90.0,
          image_key: '🅿️',
          is_active: true,
        },
        {
          title: 'Colaba Central Parking',
          description: 'Open-air paved parking space 5 minutes from Gateway of India and Colaba Causeway.',
          address: 'Shahid Bhagat Singh Road, Colaba, South Mumbai',
          latitude: 18.922,
          longitude: 72.8347,
          hourly_price: 80.0,
          image_key: '🌆',
          is_active: true,
        },
      ]

      for (const space of initialSpaces) {
        await client.query(
          `INSERT INTO parking_spaces 
            (owner_id, title, description, address, latitude, longitude, hourly_price, image_key, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            ownerId,
            space.title,
            space.description,
            space.address,
            space.latitude,
            space.longitude,
            space.hourly_price,
            space.image_key,
            space.is_active,
          ]
        )
      }
      console.log(`Seeded ${initialSpaces.length} initial Mumbai parking spaces.`)
    } else {
      console.log(`Database already has ${count} parking spaces. Skipping space seeding.`)
    }

    await client.query('COMMIT')
    console.log('--- Database Seed Complete ---')
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Seed failed:', error)
    throw error
  } finally {
    client.release()
  }
}

// Run directly if executed via `node src/seed.js`
if (process.argv[1]?.endsWith('seed.js')) {
  seedDatabase()
    .then(async () => {
      await pool.end()
      process.exit(0)
    })
    .catch(async () => {
      await pool.end()
      process.exit(1)
    })
}
