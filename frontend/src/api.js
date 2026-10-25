/**
 * ParkShare Cloud API Client
 * Configurable via import.meta.env.VITE_API_URL, defaulting to http://localhost:5050/api
 */

function getDefaultApiUrl() {
  if (typeof window !== 'undefined' && window.location) {
    // In local development on Vite dev server (port 5173), default to local backend port 5050
    if (window.location.port === '5173') {
      return 'http://localhost:5050/api'
    }
    // In production or when served by reverse proxy / ALB / Nginx, route to host /api
    return `${window.location.origin}/api`
  }
  return 'http://localhost:5050/api'
}

const rawBaseUrl =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) ||
  (typeof process !== 'undefined' && process.env && process.env.VITE_API_URL) ||
  getDefaultApiUrl()

const API_BASE_URL = rawBaseUrl.replace(/\/$/, '')
const SERVER_BASE_URL = API_BASE_URL.replace(/\/api$/, '')

export function getToken() {
  return localStorage.getItem('parkshare_token')
}

export function setToken(token) {
  if (token) {
    localStorage.setItem('parkshare_token', token)
  } else {
    localStorage.removeItem('parkshare_token')
  }
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem('parkshare_user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setStoredUser(user) {
  if (user) {
    localStorage.setItem('parkshare_user', JSON.stringify(user))
  } else {
    localStorage.removeItem('parkshare_user')
  }
}

export function clearAuth() {
  localStorage.removeItem('parkshare_token')
  localStorage.removeItem('parkshare_user')
}

/**
 * Universal fetch wrapper with authorization and JSON handling
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
  const token = getToken()

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    if (response.status === 401 && token) {
      clearAuth()
    }
    const errorMsg = data.error || data.message || `Request failed with status ${response.status}`
    const error = new Error(errorMsg)
    error.status = response.status
    error.data = data
    throw error
  }

  return data
}

// Health checks
export async function getHealth() {
  const res = await fetch(`${SERVER_BASE_URL}/health`)
  return res.json()
}

export async function getDbHealth() {
  const res = await fetch(`${API_BASE_URL}/db-health`)
  return res.json()
}

// Authentication
export async function loginUser(email, password) {
  const data = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  if (data.token) {
    setToken(data.token)
    setStoredUser(data.user)
  }
  return data
}

export async function registerUser({ name, email, password, role = 'driver' }) {
  const data = await apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, role }),
  })
  if (data.token) {
    setToken(data.token)
    setStoredUser(data.user)
  }
  return data
}

export async function getCurrentUser() {
  return apiRequest('/auth/me')
}

// Parking Spaces
export async function getSpaces(params = {}) {
  const query = new URLSearchParams()
  if (params.search) query.append('search', params.search)
  if (params.location) query.append('location', params.location)
  if (params.min_price) query.append('min_price', params.min_price)
  if (params.max_price) query.append('max_price', params.max_price)
  if (params.start_time) query.append('start_time', params.start_time)
  if (params.end_time) query.append('end_time', params.end_time)

  const queryString = query.toString() ? `?${query.toString()}` : ''
  return apiRequest(`/spaces${queryString}`)
}

export async function getSpaceById(id) {
  return apiRequest(`/spaces/${id}`)
}

// Owner Spaces
export async function getOwnerSpaces() {
  return apiRequest('/owner/spaces')
}

export async function createOwnerSpace(spaceData) {
  return apiRequest('/owner/spaces', {
    method: 'POST',
    body: JSON.stringify(spaceData),
  })
}

export async function updateOwnerSpace(id, spaceData) {
  return apiRequest(`/owner/spaces/${id}`, {
    method: 'PUT',
    body: JSON.stringify(spaceData),
  })
}

export async function deleteOwnerSpace(id) {
  return apiRequest(`/owner/spaces/${id}`, {
    method: 'DELETE',
  })
}

export async function getSpacePhotoUploadUrl({ filename, contentType, fileSize }) {
  return apiRequest('/owner/spaces/upload-url', {
    method: 'POST',
    body: JSON.stringify({ filename, contentType, fileSize }),
  })
}

// Bookings
export async function createBooking({ parking_space_id, start_time, end_time }) {
  return apiRequest('/bookings', {
    method: 'POST',
    body: JSON.stringify({ parking_space_id, start_time, end_time }),
  })
}

export async function getBookings(asOwner = false) {
  const query = asOwner ? '?as=owner' : ''
  return apiRequest(`/bookings${query}`)
}

export async function getBookingById(id) {
  return apiRequest(`/bookings/${id}`)
}

export async function cancelBooking(id) {
  return apiRequest(`/bookings/${id}/cancel`, {
    method: 'PATCH',
  })
}

export { API_BASE_URL, SERVER_BASE_URL }
