/**
 * ParkShare Cloud - Full End-to-End API & Integration Test Suite
 */

const BASE_URL = 'http://localhost:5050'
const FRONTEND_URL = 'http://localhost:5173'

let passed = 0
let failed = 0

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  ✓ ${testName}`)
    passed++
  } else {
    console.error(`  ✗ ${testName} - FAILED: ${details}`)
    failed++
  }
}

async function runAllTests() {
  console.log('\n========================================')
  console.log('  PARKSHARE CLOUD SYSTEM INTEGRATION TESTS')
  console.log('========================================\n')

  // 1. Health Endpoints
  console.log('[1/6] Testing Health & Database Connectivity')
  try {
    const healthRes = await fetch(`${BASE_URL}/health`)
    const healthData = await healthRes.json()
    assert(healthRes.status === 200 && healthData.status === 'ok', 'GET /health returns HTTP 200 with status ok')

    const dbRes = await fetch(`${BASE_URL}/api/db-health`)
    const dbData = await dbRes.json()
    assert(dbRes.status === 200 && dbData.status === 'ok' && dbData.database === 'parkshare', 'GET /api/db-health returns HTTP 200 and connected to parkshare database')
  } catch (err) {
    assert(false, 'Health check endpoints reachable', err.message)
  }

  // 2. Authentication Flow
  console.log('\n[2/6] Testing Authentication Routes')
  const testUserEmail = `driver_${Date.now()}@example.com`
  let testUserToken = null
  let testUserId = null

  try {
    // Register
    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Driver',
        email: testUserEmail,
        password: 'SecurePassword123!',
        role: 'driver',
      }),
    })
    const regData = await regRes.json()
    assert(regRes.status === 201 && regData.token && regData.user.email === testUserEmail, 'POST /api/auth/register registers new user and issues JWT')
    testUserToken = regData.token
    testUserId = regData.user.id

    // Duplicate email registration should fail with 409
    const dupRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Duplicate Driver',
        email: testUserEmail,
        password: 'SecurePassword123!',
      }),
    })
    assert(dupRes.status === 409, 'POST /api/auth/register rejects duplicate email with HTTP 409 Conflict')

    // Login
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUserEmail,
        password: 'SecurePassword123!',
      }),
    })
    const loginData = await loginRes.json()
    assert(loginRes.status === 200 && loginData.token, 'POST /api/auth/login validates password hash and returns JWT')
    assert(loginRes.headers.get('ratelimit-limit') !== null, 'POST /api/auth/login includes RateLimit security headers')

    // Invalid login should fail with 401
    const badLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUserEmail,
        password: 'WrongPassword!',
      }),
    })
    assert(badLoginRes.status === 401, 'POST /api/auth/login rejects incorrect password with HTTP 401')

    // /me endpoint
    const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${testUserToken}` },
    })
    const meData = await meRes.json()
    assert(meRes.status === 200 && meData.user.id === testUserId, 'GET /api/auth/me returns authenticated user identity')
  } catch (err) {
    assert(false, 'Auth endpoints execution', err.message)
  }

  // 3. Public Parking Spaces & Search
  console.log('\n[3/6] Testing Parking Space Listings & Search')
  let firstSpaceId = null
  try {
    const spacesRes = await fetch(`${BASE_URL}/api/spaces`)
    const spacesData = await spacesRes.json()
    assert(spacesRes.status === 200 && Array.isArray(spacesData.spaces) && spacesData.spaces.length > 0, `GET /api/spaces returns ${spacesData.spaces?.length} active spaces`)
    firstSpaceId = spacesData.spaces[0]?.id

    // Search query test
    const searchRes = await fetch(`${BASE_URL}/api/spaces?search=Bandra`)
    const searchData = await searchRes.json()
    const allMatch = searchData.spaces.every(
      (s) => s.title.includes('Bandra') || s.address.includes('Bandra')
    )
    assert(searchRes.status === 200 && searchData.spaces.length > 0 && allMatch, 'GET /api/spaces?search=Bandra correctly filters by keyword')

    // Single space detail
    const singleRes = await fetch(`${BASE_URL}/api/spaces/${firstSpaceId}`)
    const singleData = await singleRes.json()
    assert(singleRes.status === 200 && singleData.space.id === firstSpaceId, `GET /api/spaces/${firstSpaceId} returns single space details`)
  } catch (err) {
    assert(false, 'Spaces endpoints execution', err.message)
  }

  // 4. Owner-Managed Spaces
  console.log('\n[4/6] Testing Owner-Managed Parking Spaces')
  let ownerToken = null
  let createdSpaceId = null
  try {
    const ownerLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@parkshare.com', password: 'Password123!' }),
    })
    const ownerLoginData = await ownerLoginRes.json()
    ownerToken = ownerLoginData.token
    assert(ownerLoginRes.status === 200 && ownerToken, 'Owner login successful')

    // List owner spaces
    const ownerSpacesRes = await fetch(`${BASE_URL}/api/owner/spaces`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    })
    const ownerSpacesData = await ownerSpacesRes.json()
    assert(ownerSpacesRes.status === 200 && Array.isArray(ownerSpacesData.spaces), `GET /api/owner/spaces returns ${ownerSpacesData.spaces?.length} owner-managed spaces`)

    // Create space
    const newSpaceRes = await fetch(`${BASE_URL}/api/owner/spaces`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        title: 'Worli Sea Face Premium Parking',
        address: 'Worli Sea Face Road, Mumbai',
        description: 'Covered dedicated bay with high security.',
        hourly_price: 110,
        latitude: 19.0069,
        longitude: 72.8152,
        image_key: '🏢',
      }),
    })
    const newSpaceData = await newSpaceRes.json()
    assert(newSpaceRes.status === 201 && newSpaceData.space.id, 'POST /api/owner/spaces creates a new parking space')
    createdSpaceId = newSpaceData.space.id

    // Update space
    const updateSpaceRes = await fetch(`${BASE_URL}/api/owner/spaces/${createdSpaceId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ hourly_price: 125 }),
    })
    const updateSpaceData = await updateSpaceRes.json()
    assert(updateSpaceRes.status === 200 && updateSpaceData.space.hourly_price === 125, 'PUT /api/owner/spaces/:id updates space hourly price')

    // S3 Presigned Upload URL generation
    const uploadUrlRes = await fetch(`${BASE_URL}/api/owner/spaces/upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        filename: 'space-bay-photo.jpg',
        contentType: 'image/jpeg',
      }),
    })
    const uploadUrlData = await uploadUrlRes.json()
    assert(uploadUrlRes.status === 200 && uploadUrlData.uploadUrl && uploadUrlData.fileKey, 'POST /api/owner/spaces/upload-url generates presigned S3 upload URL')

    // Invalid file type rejection
    const invalidUploadRes = await fetch(`${BASE_URL}/api/owner/spaces/upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        filename: 'malicious-script.exe',
        contentType: 'application/x-msdownload',
      }),
    })
    assert(invalidUploadRes.status === 400, 'POST /api/owner/spaces/upload-url rejects non-image MIME types with HTTP 400')
  } catch (err) {
    assert(false, 'Owner routes execution', err.message)
  }

  // 5. Booking Creation, Overlap Conflict Prevention, Retrieval, and Cancellation
  console.log('\n[5/6] Testing Booking Lifecycle & Conflict Prevention')
  let testBookingId = null
  try {
    // Use the newly created space from Step 4 to ensure clean test isolation
    const bookingSpaceId = createdSpaceId || firstSpaceId || 1
    const baseTime = Date.now() + 14 * 24 * 60 * 60 * 1000 // 14 days ahead
    const start1 = new Date(baseTime)
    const end1 = new Date(baseTime + 3 * 60 * 60 * 1000) // 3 hours

    // Create Booking
    const bookRes = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({
        parking_space_id: bookingSpaceId,
        start_time: start1.toISOString(),
        end_time: end1.toISOString(),
      }),
    })
    const bookData = await bookRes.json()
    assert(bookRes.status === 201 && bookData.booking?.status === 'confirmed', `POST /api/bookings created confirmed reservation #${bookData.booking?.id} (total: ₹${bookData.booking?.total_price})`)
    testBookingId = bookData.booking?.id

    // Attempt overlapping booking (partially inside the 3 hour window)
    const overlapStart = new Date(baseTime + 1 * 60 * 60 * 1000) // +1 hour into window
    const overlapEnd = new Date(baseTime + 4 * 60 * 60 * 1000) // +4 hours
    const conflictRes = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({
        parking_space_id: bookingSpaceId,
        start_time: overlapStart.toISOString(),
        end_time: overlapEnd.toISOString(),
      }),
    })
    const conflictData = await conflictRes.json()
    assert(conflictRes.status === 409 && conflictData.error, 'POST /api/bookings strictly prevents overlapping booking with HTTP 409 Conflict')

    // Invalid booking with end_time before start_time
    const invalidTimeRes = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({
        parking_space_id: bookingSpaceId,
        start_time: end1.toISOString(),
        end_time: start1.toISOString(),
      }),
    })
    assert(invalidTimeRes.status === 400, 'POST /api/bookings rejects end_time <= start_time with HTTP 400')

    // Retrieve Driver Bookings
    const userBookingsRes = await fetch(`${BASE_URL}/api/bookings`, {
      headers: { Authorization: `Bearer ${testUserToken}` },
    })
    const userBookingsData = await userBookingsRes.json()
    const foundBooking = userBookingsData.bookings.find((b) => b.id === testBookingId)
    assert(userBookingsRes.status === 200 && foundBooking && foundBooking.status === 'confirmed', 'GET /api/bookings returns user reservations including new booking')

    // Cancel Booking
    const cancelRes = await fetch(`${BASE_URL}/api/bookings/${testBookingId}/cancel`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${testUserToken}` },
    })
    const cancelData = await cancelRes.json()
    assert(cancelRes.status === 200 && cancelData.booking?.status === 'cancelled', `PATCH /api/bookings/${testBookingId}/cancel successfully cancels booking`)

    // Now that the booking is cancelled, the previously conflicting window is bookable again!
    const rebookRes = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({
        parking_space_id: bookingSpaceId,
        start_time: start1.toISOString(),
        end_time: end1.toISOString(),
      }),
    })
    const rebookData = await rebookRes.json()
    assert(rebookRes.status === 201 && rebookData.booking?.status === 'confirmed', 'POST /api/bookings allows booking after previous reservation was cancelled')

    // Clean up rebooking
    if (rebookData.booking?.id) {
      await fetch(`${BASE_URL}/api/bookings/${rebookData.booking.id}/cancel`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${testUserToken}` },
      })
    }

    // Edge Case: Past booking should fail with 400
    const pastBookRes = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({
        parking_space_id: bookingSpaceId,
        start_time: '2020-01-01T10:00:00.000Z',
        end_time: '2020-01-01T12:00:00.000Z',
      }),
    })
    assert(pastBookRes.status === 400, 'POST /api/bookings rejects reservation start_time in the past with HTTP 400')

    // Edge Case: Owner self-booking should fail with 400
    // createdSpaceId is owned by owner@parkshare.com (ownerToken)
    const futureStart = new Date(baseTime + 48 * 60 * 60 * 1000)
    const futureEnd = new Date(baseTime + 50 * 60 * 60 * 1000)
    const selfBookRes = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        parking_space_id: bookingSpaceId,
        start_time: futureStart.toISOString(),
        end_time: futureEnd.toISOString(),
      }),
    })
    assert(selfBookRes.status === 400, 'POST /api/bookings rejects owner reserving their own parking space with HTTP 400')

    // Edge Case: Password > 128 characters should fail with 400
    const longPassRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Oversize Pass User',
        email: `oversize_${Date.now()}@example.com`,
        password: 'A'.repeat(150),
      }),
    })
    assert(longPassRes.status === 400, 'POST /api/auth/register rejects password > 128 characters with HTTP 400')

    // Concurrency Test: 2 simultaneous booking requests for identical slot
    const concurrentStart = new Date(baseTime + 72 * 60 * 60 * 1000)
    const concurrentEnd = new Date(baseTime + 75 * 60 * 60 * 1000)
    const payload = JSON.stringify({
      parking_space_id: bookingSpaceId,
      start_time: concurrentStart.toISOString(),
      end_time: concurrentEnd.toISOString(),
    })

    const [reqA, reqB] = await Promise.all([
      fetch(`${BASE_URL}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserToken}`,
        },
        body: payload,
      }),
      fetch(`${BASE_URL}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserToken}`,
        },
        body: payload,
      }),
    ])

    const statuses = [reqA.status, reqB.status].sort()
    assert(
      statuses[0] === 201 && statuses[1] === 409,
      'Concurrent booking requests: exactly one succeeds (201) and one is rejected (409 Conflict)'
    )

    // Clean up successful concurrent booking
    const dataA = await reqA.json()
    const dataB = await reqB.json()
    const successId = dataA.booking?.id || dataB.booking?.id
    if (successId) {
      await fetch(`${BASE_URL}/api/bookings/${successId}/cancel`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${testUserToken}` },
      })
    }

    // Booking Lifecycle: Idempotent sync of past bookings
    const syncRes = await fetch(`${BASE_URL}/api/bookings/sync-completed`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${testUserToken}` },
    })
    const syncData = await syncRes.json()
    assert(syncRes.status === 200 && syncData.success === true, 'POST /api/bookings/sync-completed executes idempotently without error')

    // Authorization Boundary: User B cannot view or cancel User A's reservation
    // Create a new distinct user (Driver B)
    const driverBEmail = `driver_b_${Date.now()}@example.com`
    const regBRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Driver B',
        email: driverBEmail,
        password: 'DriverBPass123!',
        role: 'driver',
      }),
    })
    const regBData = await regBRes.json()
    const driverBToken = regBData.token

    // Create a booking as testUser (Driver A)
    const bookARes = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({
        parking_space_id: bookingSpaceId,
        start_time: new Date(baseTime + 80 * 60 * 60 * 1000).toISOString(),
        end_time: new Date(baseTime + 82 * 60 * 60 * 1000).toISOString(),
      }),
    })
    const bookAData = await bookARes.json()
    const bookingAId = bookAData.booking?.id

    // Driver B attempts to view Driver A's booking -> HTTP 403
    const viewForbiddenRes = await fetch(`${BASE_URL}/api/bookings/${bookingAId}`, {
      headers: { Authorization: `Bearer ${driverBToken}` },
    })
    assert(viewForbiddenRes.status === 403, 'GET /api/bookings/:id prevents unauthorized user from viewing another user reservation with HTTP 403')

    // Driver B attempts to cancel Driver A's booking -> HTTP 403
    const cancelForbiddenRes = await fetch(`${BASE_URL}/api/bookings/${bookingAId}/cancel`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${driverBToken}` },
    })
    assert(cancelForbiddenRes.status === 403, 'PATCH /api/bookings/:id/cancel prevents unauthorized user from cancelling another user reservation with HTTP 403')

    // Clean up booking A
    if (bookingAId) {
      await fetch(`${BASE_URL}/api/bookings/${bookingAId}/cancel`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${testUserToken}` },
      })
    }

    // S3 Validation: File size limit (>5MB rejected)
    const oversizeUploadRes = await fetch(`${BASE_URL}/api/owner/spaces/upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        filename: 'huge-file.png',
        contentType: 'image/png',
        fileSize: 6 * 1024 * 1024, // 6MB
      }),
    })
    assert(oversizeUploadRes.status === 400, 'POST /api/owner/spaces/upload-url rejects files exceeding 5MB with HTTP 400')

    // S3 Validation: Arbitrary / malicious S3 object path rejected
    const arbitraryKeyRes = await fetch(`${BASE_URL}/api/owner/spaces`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        title: 'Malicious Path Parking',
        address: 'Downtown Mumbai',
        hourly_price: 150,
        image_key: '../../../../etc/passwd',
      }),
    })
    assert(arbitraryKeyRes.status === 400, 'POST /api/owner/spaces rejects arbitrary S3 object paths with HTTP 400')
  } catch (err) {
    assert(false, 'Booking lifecycle execution', err.message)
  }

  // 6. Optional Frontend Server Check (when dev server is running)
  console.log('\n[6/6] Checking Frontend Server (if running)')
  try {
    const feRes = await fetch(FRONTEND_URL, { signal: AbortSignal.timeout(1500) })
    const feHtml = await feRes.text()
    assert(feRes.status === 200 && feHtml.includes('<!doctype html>'), 'Frontend dev server reachable at http://localhost:5173')
  } catch {
    console.log('  ℹ Frontend server not running on port 5173 (skipped for backend test run)')
  }

  console.log('\n========================================')
  console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`)
  console.log('========================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runAllTests().catch((err) => {
  console.error('Fatal test error:', err)
  process.exit(1)
})
