import test from 'node:test'
import assert from 'node:assert/strict'

// Properly mock localStorage for Node test runner
const store = new Map()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  },
  writable: true,
  configurable: true,
})

// Import api storage helpers
import {
  getToken,
  setToken,
  getStoredUser,
  setStoredUser,
  clearAuth,
  API_BASE_URL,
  SERVER_BASE_URL,
} from '../src/api.js'

test('Frontend Auth Storage & State Management', async (t) => {
  await t.test('setToken and getToken manage JWT in storage', () => {
    clearAuth()
    assert.equal(getToken(), null, 'Initially null')
    setToken('jwt-test-sample-token')
    assert.equal(getToken(), 'jwt-test-sample-token', 'Token matches saved value')
    setToken(null)
    assert.equal(getToken(), null, 'Token cleared on null')
  })

  await t.test('setStoredUser and getStoredUser correctly serialize and deserialize user', () => {
    clearAuth()
    assert.equal(getStoredUser(), null, 'Initially null')
    const sampleUser = { id: 42, name: 'Driver Test', email: 'driver@parkshare.com', role: 'driver' }
    setStoredUser(sampleUser)
    assert.deepEqual(getStoredUser(), sampleUser, 'User object matches')
    clearAuth()
    assert.equal(getStoredUser(), null, 'User cleared on clearAuth()')
  })

  await t.test('API_BASE_URL and SERVER_BASE_URL format consistently without trailing slash', () => {
    assert.ok(!API_BASE_URL.endsWith('/'), 'API_BASE_URL has no trailing slash')
    assert.ok(!SERVER_BASE_URL.endsWith('/'), 'SERVER_BASE_URL has no trailing slash')
    assert.ok(API_BASE_URL.includes('/api'), 'API_BASE_URL includes /api path')
  })
})
