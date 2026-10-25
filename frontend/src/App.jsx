import { useState, useEffect, useCallback } from 'react'
import './App.css'
import {
  getSpaces,
  loginUser,
  registerUser,
  getStoredUser,
  clearAuth,
  getDbHealth,
  createBooking,
  getBookings,
  cancelBooking,
  createOwnerSpace,
  updateOwnerSpace,
  getCurrentUser,
  getOwnerSpaces,
  deleteOwnerSpace,
  getSpacePhotoUploadUrl,
} from './api'

function formatDateTimeForInput(date) {
  const pad = (n) => String(n).padStart(2, '0')
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const h = pad(date.getHours())
  const min = pad(date.getMinutes())
  return `${y}-${m}-${d}T${h}:${min}`
}

function formatDisplayDate(dateStr) {
  try {
    const d = new Date(dateStr)
    return d.toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

function getDefaultBookingDates() {
  const start = new Date(Date.now() + 60 * 60 * 1000)
  start.setMinutes(0, 0, 0)
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000)
  return {
    start: formatDateTimeForInput(start),
    end: formatDateTimeForInput(end),
  }
}

function App() {
  const [user, setUser] = useState(() => getStoredUser())
  const [spaces, setSpaces] = useState([])
  const [loadingSpaces, setLoadingSpaces] = useState(true)
  const [search, setSearch] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [filterStart, setFilterStart] = useState('')
  const [filterEnd, setFilterEnd] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [notice, setNotice] = useState(null)
  const [dbStatus, setDbStatus] = useState({ connected: false, database: '', checking: true })

  // Modals state: null | 'auth' | 'booking' | 'my-bookings' | 'list-space' | 'booking-details'
  const [activeModal, setActiveModal] = useState(null)
  const [selectedSpace, setSelectedSpace] = useState(null)
  const [selectedBookingDetails, setSelectedBookingDetails] = useState(null)

  // Auth modal state
  const [authMode, setAuthMode] = useState('login') // 'login' | 'register'
  const [authName, setAuthName] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authRole, setAuthRole] = useState('driver')
  const [authError, setAuthError] = useState(null)
  const [authLoading, setAuthLoading] = useState(false)

  // Booking modal state
  const [bookingStart, setBookingStart] = useState(() => getDefaultBookingDates().start)
  const [bookingEnd, setBookingEnd] = useState(() => getDefaultBookingDates().end)
  const [bookingError, setBookingError] = useState(null)
  const [bookingSuccess, setBookingSuccess] = useState(null)
  const [bookingLoading, setBookingLoading] = useState(false)

  // My Bookings state
  const [bookingTab, setBookingTab] = useState('driver') // 'driver' | 'owner'
  const [userBookings, setUserBookings] = useState([])
  const [loadingBookings, setLoadingBookings] = useState(false)
  const [bookingsError, setBookingsError] = useState(null)

  // Owner Portal modal state
  const [ownerTab, setOwnerTab] = useState('create') // 'create' | 'manage'
  const [ownerSpaces, setOwnerSpaces] = useState([])
  const [loadingOwnerSpaces, setLoadingOwnerSpaces] = useState(false)
  const [editingSpaceId, setEditingSpaceId] = useState(null)
  const [spaceTitle, setSpaceTitle] = useState('')
  const [spaceAddress, setSpaceAddress] = useState('')
  const [spaceDescription, setSpaceDescription] = useState('')
  const [spacePrice, setSpacePrice] = useState('75')
  const [spaceIcon, setSpaceIcon] = useState('🏢')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [spaceError, setSpaceError] = useState(null)
  const [spaceLoading, setSpaceLoading] = useState(false)

  // Escape key handler to close modals
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setActiveModal(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Check Database & API Health
  useEffect(() => {
    getDbHealth()
      .then((data) => {
        setDbStatus({
          connected: data.status === 'ok',
          database: data.database || 'parkshare',
          checking: false,
        })
      })
      .catch(() => {
        setDbStatus({ connected: false, database: '', checking: false })
      })
  }, [])

  // Verify auth session on load
  useEffect(() => {
    if (user?.id) {
      getCurrentUser()
        .then((res) => {
          if (res?.user) setUser(res.user)
        })
        .catch(() => {
          clearAuth()
          setUser(null)
        })
    }
  }, [user?.id])

  // Fetch real spaces from API with active filters
  const fetchSpaces = useCallback((params = {}) => {
    let isCancelled = false
    getSpaces(params)
      .then((data) => {
        if (!isCancelled) {
          setSpaces(data.spaces || [])
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error('Failed to load parking spaces:', err)
          setNotice(`Unable to load parking spaces: ${err.message}`)
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setLoadingSpaces(false)
        }
      })
    return () => {
      isCancelled = true
    }
  }, [])

  const fetchFilteredSpaces = useCallback(() => {
    setLoadingSpaces(true)
    const params = {}
    if (search.trim()) params.search = search.trim()
    if (minPrice !== '') params.min_price = minPrice
    if (maxPrice !== '') params.max_price = maxPrice
    if (filterStart && filterEnd) {
      const s = new Date(filterStart)
      const e = new Date(filterEnd)
      if (!isNaN(s.getTime()) && !isNaN(e.getTime()) && e > s) {
        params.start_time = s.toISOString()
        params.end_time = e.toISOString()
      }
    }
    return fetchSpaces(params)
  }, [fetchSpaces, search, minPrice, maxPrice, filterStart, filterEnd])

  useEffect(() => {
    const cancel = fetchSpaces({ search })
    return () => {
      if (cancel) cancel()
    }
  }, [fetchSpaces, search])

  // Fetch user bookings (as driver or as space owner)
  const loadUserBookings = async (asOwner = false) => {
    if (!user) return
    setLoadingBookings(true)
    setBookingsError(null)
    try {
      const data = await getBookings(asOwner)
      setUserBookings(data.bookings || [])
    } catch (err) {
      setBookingsError(err.message)
    } finally {
      setLoadingBookings(false)
    }
  }

  // Fetch owner-managed spaces
  const loadOwnerSpaces = async () => {
    setLoadingOwnerSpaces(true)
    setSpaceError(null)
    try {
      const data = await getOwnerSpaces()
      setOwnerSpaces(data.spaces || [])
    } catch (err) {
      setSpaceError(err.message)
    } finally {
      setLoadingOwnerSpaces(false)
    }
  }

  // Handle Authentication
  const handleAuthSubmit = async (e) => {
    e.preventDefault()
    setAuthError(null)
    setAuthLoading(true)
    try {
      let res
      if (authMode === 'login') {
        res = await loginUser(authEmail, authPassword)
      } else {
        res = await registerUser({
          name: authName,
          email: authEmail,
          password: authPassword,
          role: authRole,
        })
      }
      setUser(res.user)
      setActiveModal(null)
      setAuthPassword('')
      setNotice(`Welcome back, ${res.user.name}!`)
    } catch (err) {
      setAuthError(err.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = () => {
    clearAuth()
    setUser(null)
    setNotice('Logged out successfully.')
  }

  // Handle Booking Initiation
  const openBookingModal = (space) => {
    if (!user) {
      setNotice('Please sign in or create an account to book a parking spot.')
      setAuthMode('login')
      setActiveModal('auth')
      return
    }
    setSelectedSpace(space)
    setBookingError(null)
    setBookingSuccess(null)
    setActiveModal('booking')
  }

  // Calculate dynamic price in booking modal
  const calcDurationAndPrice = () => {
    if (!selectedSpace || !bookingStart || !bookingEnd) return { hours: 0, total: 0 }
    const start = new Date(bookingStart)
    const end = new Date(bookingEnd)
    const diffMs = end.getTime() - start.getTime()
    if (diffMs <= 0 || isNaN(diffMs)) return { hours: 0, total: 0 }
    const hours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10
    const total = Math.round(hours * selectedSpace.hourly_price * 100) / 100
    return { hours, total }
  }

  const handleCreateBooking = async (e) => {
    e.preventDefault()
    if (!selectedSpace) return
    setBookingError(null)
    setBookingLoading(true)
    try {
      const res = await createBooking({
        parking_space_id: selectedSpace.id,
        start_time: new Date(bookingStart).toISOString(),
        end_time: new Date(bookingEnd).toISOString(),
      })
      setBookingSuccess(res.booking)
      setNotice(`✓ Reservation confirmed for ${selectedSpace.title} (₹${res.booking.total_price})!`)
    } catch (err) {
      if (err.status === 409) {
        setBookingError('This space is already booked during your selected time window. Please choose a different time.')
      } else {
        setBookingError(err.message)
      }
    } finally {
      setBookingLoading(false)
    }
  }

  // Handle Booking Cancellation
  const handleCancelBooking = async (bookingId) => {
    if (!window.confirm('Are you sure you want to cancel this reservation?')) return
    try {
      await cancelBooking(bookingId)
      await loadUserBookings(bookingTab === 'owner')
      setNotice('Reservation cancelled successfully.')
    } catch (err) {
      alert(`Cancellation failed: ${err.message}`)
    }
  }

  // Start editing an existing space
  const handleStartEditSpace = (space) => {
    setEditingSpaceId(space.id)
    setSpaceTitle(space.title)
    setSpaceAddress(space.address)
    setSpaceDescription(space.description || '')
    setSpacePrice(String(space.hourly_price))
    setSpaceIcon(space.image_key || '🏢')
    setPhotoFile(null)
    setPhotoPreview(null)
    setOwnerTab('create')
  }

  // Handle Space Listing (Create or Update)
  const handleListSpace = async (e) => {
    e.preventDefault()
    setSpaceError(null)
    setSpaceLoading(true)
    try {
      let finalImageKey = spaceIcon

      // If a photo was selected, get presigned upload URL and upload
      if (photoFile) {
        setUploadingPhoto(true)
        const presigned = await getSpacePhotoUploadUrl({
          filename: photoFile.name,
          contentType: photoFile.type,
          fileSize: photoFile.size,
        })
        finalImageKey = presigned.fileKey
        // If not mock and uploadUrl available, execute PUT upload
        if (!presigned.isMock && presigned.uploadUrl) {
          await fetch(presigned.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': photoFile.type },
            body: photoFile,
          })
        }
      }

      if (editingSpaceId) {
        await updateOwnerSpace(editingSpaceId, {
          title: spaceTitle,
          address: spaceAddress,
          description: spaceDescription,
          hourly_price: Number(spacePrice),
          image_key: finalImageKey,
        })
        setNotice(`✓ Updated "${spaceTitle}" successfully!`)
      } else {
        await createOwnerSpace({
          title: spaceTitle,
          address: spaceAddress,
          description: spaceDescription,
          hourly_price: Number(spacePrice),
          image_key: finalImageKey,
        })
        setNotice('✓ Your parking space was published successfully!')
      }

      setSpaceTitle('')
      setSpaceAddress('')
      setSpaceDescription('')
      setPhotoFile(null)
      setPhotoPreview(null)
      setEditingSpaceId(null)
      fetchFilteredSpaces()
      await loadOwnerSpaces()
      setOwnerTab('manage')
    } catch (err) {
      setSpaceError(err.message)
    } finally {
      setSpaceLoading(false)
      setUploadingPhoto(false)
    }
  }

  // Handle Deactivating Space
  const handleDeactivateSpace = async (spaceId) => {
    if (!window.confirm('Are you sure you want to deactivate this parking spot?')) return
    try {
      await deleteOwnerSpace(spaceId)
      await loadOwnerSpaces()
      fetchSpaces(search)
      setNotice('Parking spot deactivated.')
    } catch (err) {
      alert(`Deactivation failed: ${err.message}`)
    }
  }

  const { hours: bookingHours, total: bookingTotalPrice } = calcDurationAndPrice()
  const [nowInputMin] = useState(() => formatDateTimeForInput(new Date()))

  return (
    <div className="app">
      <nav className="navbar">
        <a className="brand" href="#">
          Park<span>Share</span>
          <small> CLOUD</small>
        </a>

        <div className="nav-links">
          <a href="#parking">Find Parking</a>
          <a href="#how">How it works</a>

          {dbStatus.connected ? (
            <span className="db-status-pill" title={`Connected to ${dbStatus.database}`}>
              ● DB Connected
            </span>
          ) : (
            <span className="db-status-pill error" title="Database disconnected">
              ○ DB Offline
            </span>
          )}

          {user ? (
            <>
              <button
                id="user-profile-btn"
                className="user-menu-btn"
                onClick={() => {
                  setBookingTab('driver')
                  loadUserBookings(false)
                  setActiveModal('my-bookings')
                }}
              >
                <span>{user.name.split(' ')[0]}</span>
                <span className="role-tag">{user.role}</span>
              </button>
              <button
                id="my-bookings-btn"
                className="btn-secondary"
                onClick={() => {
                  setBookingTab('driver')
                  loadUserBookings(false)
                  setActiveModal('my-bookings')
                }}
              >
                My Bookings
              </button>
              <button
                id="list-space-nav-btn"
                className="owner-btn"
                onClick={() => {
                  setOwnerTab('create')
                  setActiveModal('list-space')
                }}
              >
                Owner Portal ↗
              </button>
              <button id="logout-btn" className="btn-secondary" onClick={handleLogout}>
                Log out
              </button>
            </>
          ) : (
            <>
              <button
                id="login-btn"
                className="login-btn"
                onClick={() => {
                  setAuthMode('login')
                  setAuthError(null)
                  setActiveModal('auth')
                }}
              >
                Log in
              </button>
              <button
                id="owner-btn"
                className="owner-btn"
                onClick={() => {
                  if (!user) {
                    setAuthMode('register')
                    setAuthRole('owner')
                    setAuthError(null)
                    setActiveModal('auth')
                  } else {
                    setOwnerTab('create')
                    setActiveModal('list-space')
                  }
                }}
              >
                List your space ↗
              </button>
            </>
          )}
        </div>
      </nav>

      <main>
        <section className="hero">
          <div className="hero-content">
            <span className="eyebrow">✦ SMART PARKING, SIMPLIFIED</span>
            <h1>
              Your space.
              <br />
              Your city.
              <br />
              <span>Your parking.</span>
            </h1>
            <p>
              Discover verified parking spots around Mumbai. Book a space, skip the circling, and get on with your day.
            </p>
            <a className="hero-cta" href="#parking">
              Find my parking <span>→</span>
            </a>
            <div className="trust">
              <span>✓ Live PostgreSQL database</span>
              <span>✓ Conflict-free reservations</span>
              <span>✓ Verified local spaces</span>
            </div>
          </div>
          <div className="hero-art">
            <div className="art-glow"></div>
            <div className="parking-sign">P</div>
            <div className="road-line"></div>
            <div className="car">🚙</div>
            <div className="floating-card">
              <span>● LIVE AVAILABILITY</span>
              <strong>Parking found!</strong>
              <small>Bandra West · 250m away</small>
            </div>
            <div className="art-caption">PARK SMART. LIVE MORE.</div>
          </div>
        </section>

        <section className="search-panel" id="parking">
          <div className="search-title">
            <span>01 / FIND YOUR SPACE</span>
            <h2>Where are you headed?</h2>
          </div>
          <div style={{ flex: 1 }}>
            <div className="search-controls">
              <label>
                LOCATION / KEYWORD
                <input
                  id="search-input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search Bandra, BKC, Colaba, Juhu..."
                />
              </label>
              <button
                id="search-btn"
                onClick={() => {
                  fetchFilteredSpaces()
                  document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' })
                }}
              >
                Search spaces ↗
              </button>
            </div>

            <div className="filter-toggle-row">
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '6px 12px', fontSize: '11px', marginTop: '10px' }}
                onClick={() => setShowFilters(!showFilters)}
              >
                {showFilters ? '▴ Hide Filters' : '▾ Price & Availability Filters'}
              </button>
              {(minPrice || maxPrice || filterStart || filterEnd) && (
                <span style={{ fontSize: '11px', color: '#16835b', fontWeight: '600' }}>
                  ● Filters Active
                </span>
              )}
            </div>

            {showFilters && (
              <div className="filter-row">
                <div className="filter-group">
                  <label>MIN PRICE (₹)</label>
                  <input
                    className="filter-input"
                    type="number"
                    min="0"
                    placeholder="Min ₹"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                  />
                </div>
                <div className="filter-group">
                  <label>MAX PRICE (₹)</label>
                  <input
                    className="filter-input"
                    type="number"
                    min="0"
                    placeholder="Max ₹"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                  />
                </div>
                <div className="filter-group">
                  <label>CHECK-IN TIME</label>
                  <input
                    className="filter-input"
                    type="datetime-local"
                    min={nowInputMin}
                    value={filterStart}
                    onChange={(e) => setFilterStart(e.target.value)}
                  />
                </div>
                <div className="filter-group">
                  <label>CHECK-OUT TIME</label>
                  <input
                    className="filter-input"
                    type="datetime-local"
                    min={filterStart || nowInputMin}
                    value={filterEnd}
                    onChange={(e) => setFilterEnd(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn-clear-filters"
                    onClick={() => {
                      setMinPrice('')
                      setMaxPrice('')
                      setFilterStart('')
                      setFilterEnd('')
                      fetchSpaces({ search })
                    }}
                  >
                    Clear Filters
                  </button>
                  <button
                    type="button"
                    className="btn-edit-space"
                    style={{ height: '36px', padding: '0 14px' }}
                    onClick={() => fetchFilteredSpaces()}
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="listings" id="results">
          <div className="section-heading">
            <div>
              <span className="eyebrow">PICK YOUR SPOT</span>
              <h2>
                Parking around you<span>.</span>
              </h2>
            </div>
            <span className="result-count">
              {loadingSpaces ? 'SEARCHING SPACES...' : `${spaces.length} SPACES AVAILABLE`}
            </span>
          </div>

          {notice && (
            <div className="notice" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{notice}</span>
              <button
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
                onClick={() => setNotice(null)}
                aria-label="Dismiss notice"
              >
                ✕
              </button>
            </div>
          )}

          <div className="space-grid">
            {spaces.map((space, index) => (
              <article className="space-card" key={space.id}>
                <div className={`space-image image-${(index % 3) + 1}`}>
                  {space.image_key && (space.image_key.startsWith('http') || space.image_key.startsWith('spaces/')) ? (
                    <img
                      src={space.image_key.startsWith('http') ? space.image_key : `https://parkshare-spaces-bucket.s3.ap-south-1.amazonaws.com/${space.image_key}`}
                      alt={space.title}
                      onError={(e) => {
                        e.target.style.display = 'none'
                        if (e.target.nextSibling) e.target.nextSibling.style.display = 'block'
                      }}
                    />
                  ) : null}
                  <span style={{ display: space.image_key && (space.image_key.startsWith('http') || space.image_key.startsWith('spaces/')) ? 'none' : 'block' }}>
                    {space.image_key || '🅿️'}
                  </span>
                  <small>{space.owner_name ? `BY ${space.owner_name.toUpperCase()}` : 'VERIFIED'}</small>
                </div>
                <div className="space-info">
                  <div className="space-type">VERIFIED PARKING SPOT</div>
                  <h3>{space.title}</h3>
                  <p>⌖ {space.address}</p>
                  {space.description && (
                    <p style={{ marginTop: '6px', color: '#889489', fontSize: '11px', lineHeight: '1.4' }}>
                      {space.description}
                    </p>
                  )}
                  <div className="space-bottom">
                    <div>
                      <strong>₹{space.hourly_price}</strong>
                      <span> / hour</span>
                    </div>
                    <button id={`book-space-btn-${space.id}`} onClick={() => openBookingModal(space)}>
                      Book spot ↗
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {!loadingSpaces && spaces.length === 0 && (
            <div className="empty" style={{ textAlign: 'center', padding: '40px' }}>
              <h3>No matching spaces found</h3>
              <p style={{ color: '#79867c', marginTop: '6px' }}>
                Try searching another Mumbai location or clear your filter.
              </p>
              {search && (
                <button
                  className="btn-secondary"
                  style={{ marginTop: '16px' }}
                  onClick={() => setSearch('')}
                >
                  Clear search
                </button>
              )}
            </div>
          )}
        </section>

        <section className="how" id="how">
          <span className="eyebrow">SIMPLE BY DESIGN</span>
          <h2>Park in three steps.</h2>
          <div className="steps">
            <div>
              <b>01</b>
              <h3>Find a spot</h3>
              <p>Search real-time parking spaces near your destination across Mumbai.</p>
            </div>
            <div>
              <b>02</b>
              <h3>Reserve it</h3>
              <p>Lock your arrival and departure times with instant conflict protection.</p>
            </div>
            <div>
              <b>03</b>
              <h3>Arrive & park</h3>
              <p>Head straight to your reserved spot with guaranteed availability.</p>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <a className="brand" href="#">
          Park<span>Share</span>
          <small> CLOUD</small>
        </a>
        <p>Less circling. More living. © 2026 ParkShare Cloud</p>
      </footer>

      {/* --- AUTHENTICATION MODAL --- */}
      {activeModal === 'auth' && (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)} role="dialog" aria-modal="true" aria-label="Sign In or Register">
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>{authMode === 'login' ? 'Sign In to ParkShare' : 'Create an Account'}</h3>
                <p>Access live parking reservations and manage spaces</p>
              </div>
              <button className="modal-close" onClick={() => setActiveModal(null)} aria-label="Close modal">
                ✕
              </button>
            </div>

            <div className="modal-tabs">
              <button
                className={`tab-btn ${authMode === 'login' ? 'active' : ''}`}
                onClick={() => {
                  setAuthMode('login')
                  setAuthError(null)
                }}
              >
                Log In
              </button>
              <button
                className={`tab-btn ${authMode === 'register' ? 'active' : ''}`}
                onClick={() => {
                  setAuthMode('register')
                  setAuthError(null)
                }}
              >
                Sign Up
              </button>
            </div>

            {authError && <div className="alert-error">{authError}</div>}

            {authMode === 'login' && (
              <div className="demo-hints">
                <button
                  id="demo-driver-btn"
                  type="button"
                  className="demo-hint-btn"
                  onClick={() => {
                    setAuthEmail('driver@parkshare.com')
                    setAuthPassword('Password123!')
                  }}
                >
                  ⚡ Demo Driver
                </button>
                <button
                  id="demo-owner-btn"
                  type="button"
                  className="demo-hint-btn"
                  onClick={() => {
                    setAuthEmail('owner@parkshare.com')
                    setAuthPassword('Password123!')
                  }}
                >
                  ⚡ Demo Owner
                </button>
              </div>
            )}

            <form onSubmit={handleAuthSubmit}>
              {authMode === 'register' && (
                <>
                  <div className="form-group">
                    <label>Full Name</label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="e.g. Priya Sharma"
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Account Role</label>
                    <select
                      className="form-select"
                      value={authRole}
                      onChange={(e) => setAuthRole(e.target.value)}
                    >
                      <option value="driver">Driver (Search & Book Parking)</option>
                      <option value="owner">Space Owner (List & Manage Spots)</option>
                    </select>
                  </div>
                </>
              )}

              <div className="form-group">
                <label>Email Address</label>
                <input
                  className="form-input"
                  type="email"
                  placeholder="name@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Password</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  required
                  minLength={6}
                  maxLength={128}
                />
              </div>

              <button id="auth-submit-btn" className="form-submit" type="submit" disabled={authLoading}>
                {authLoading
                  ? 'Processing...'
                  : authMode === 'login'
                  ? 'Log In'
                  : 'Create Account'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- BOOKING MODAL --- */}
      {activeModal === 'booking' && selectedSpace && (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)} role="dialog" aria-modal="true" aria-label="Reserve Parking Spot">
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Reserve Parking Spot</h3>
                <p>{selectedSpace.title} · {selectedSpace.address}</p>
              </div>
              <button className="modal-close" onClick={() => setActiveModal(null)} aria-label="Close modal">
                ✕
              </button>
            </div>

            {bookingSuccess ? (
              <div>
                <div className="alert-success">
                  <strong>✓ Booking Confirmed!</strong>
                  <p style={{ margin: '6px 0 0', fontSize: '12px' }}>
                    Reservation #{bookingSuccess.id} has been registered in the database for ₹
                    {bookingSuccess.total_price}.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                  <button
                    className="form-submit"
                    style={{ margin: 0 }}
                    onClick={() => {
                      setBookingTab('driver')
                      setActiveModal('my-bookings')
                      loadUserBookings(false)
                    }}
                  >
                    View My Reservations
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => setActiveModal(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateBooking}>
                {bookingError && <div className="alert-error">{bookingError}</div>}

                <div className="form-row">
                  <div className="form-group">
                    <label>Start Time</label>
                    <input
                      className="form-input"
                      type="datetime-local"
                      min={nowInputMin}
                      value={bookingStart}
                      onChange={(e) => setBookingStart(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>End Time</label>
                    <input
                      className="form-input"
                      type="datetime-local"
                      min={bookingStart || nowInputMin}
                      value={bookingEnd}
                      onChange={(e) => setBookingEnd(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="price-breakdown">
                  <div>
                    <div className="total-label">
                      RATE: ₹{selectedSpace.hourly_price}/hr ({bookingHours > 0 ? `${bookingHours} hrs` : '0 hrs'})
                    </div>
                    <small style={{ color: '#88968b', fontSize: '11px' }}>
                      Includes verified spot hold & protection
                    </small>
                  </div>
                  <div className="total-value">₹{bookingTotalPrice}</div>
                </div>

                <button
                  id="confirm-booking-btn"
                  className="form-submit"
                  type="submit"
                  disabled={bookingLoading || bookingTotalPrice <= 0}
                >
                  {bookingLoading ? 'Confirming Reservation...' : `Confirm & Book for ₹${bookingTotalPrice}`}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* --- MY BOOKINGS MODAL --- */}
      {activeModal === 'my-bookings' && (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)} role="dialog" aria-modal="true" aria-label="My Parking Reservations">
          <div className="modal-card" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Parking Reservations</h3>
                <p>Manage confirmed, completed, and past reservations</p>
              </div>
              <button className="modal-close" onClick={() => setActiveModal(null)} aria-label="Close modal">
                ✕
              </button>
            </div>

            {user?.role === 'owner' && (
              <div className="modal-tabs">
                <button
                  className={`tab-btn ${bookingTab === 'driver' ? 'active' : ''}`}
                  onClick={() => {
                    setBookingTab('driver')
                    loadUserBookings(false)
                  }}
                >
                  My Reservations (as Driver)
                </button>
                <button
                  className={`tab-btn ${bookingTab === 'owner' ? 'active' : ''}`}
                  onClick={() => {
                    setBookingTab('owner')
                    loadUserBookings(true)
                  }}
                >
                  Bookings on My Spots
                </button>
              </div>
            )}

            {loadingBookings ? (
              <p style={{ textAlign: 'center', padding: '30px' }}>Loading reservations...</p>
            ) : bookingsError ? (
              <div className="alert-error">{bookingsError}</div>
            ) : userBookings.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px' }}>
                <p style={{ color: '#79867c' }}>No reservations found in this section.</p>
                <button
                  className="form-submit"
                  style={{ width: 'auto', padding: '10px 20px', marginTop: '14px' }}
                  onClick={() => setActiveModal(null)}
                >
                  Explore Spaces
                </button>
              </div>
            ) : (
              <div className="bookings-list">
                {userBookings.map((b) => (
                  <article className="booking-card" key={b.id}>
                    <div className="booking-card-header">
                      <h4>{b.space_title || `Space #${b.parking_space_id}`}</h4>
                      <span className={`badge-pill badge-${b.status}`}>
                        {b.status}
                      </span>
                    </div>
                    <div className="booking-card-body">
                      {b.space_address && <div>⌖ {b.space_address}</div>}
                      {b.driver_name && <div>👤 Booked by: {b.driver_name}</div>}
                      <div>
                        📅 {formatDisplayDate(b.start_time)} → {formatDisplayDate(b.end_time)}
                      </div>
                    </div>
                    <div className="booking-card-footer">
                      <strong>₹{b.total_price}</strong>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          className="btn-view-details"
                          onClick={() => {
                            setSelectedBookingDetails(b)
                            setActiveModal('booking-details')
                          }}
                        >
                          View Details
                        </button>
                        {b.status === 'confirmed' && (
                          <button
                            className="cancel-booking-btn"
                            onClick={() => handleCancelBooking(b.id)}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- BOOKING DETAILS MODAL --- */}
      {activeModal === 'booking-details' && selectedBookingDetails && (
        <div
          className="modal-backdrop"
          onClick={() => setActiveModal(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Reservation Details"
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Reservation #{selectedBookingDetails.id}</h3>
                <p>Confirmed parking space reservation details</p>
              </div>
              <button
                className="modal-close"
                onClick={() => setActiveModal(null)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <div className="booking-detail-grid">
              <div className="booking-detail-row">
                <span className="booking-detail-label">Status</span>
                <span className={`badge-pill badge-${selectedBookingDetails.status}`}>
                  {selectedBookingDetails.status.toUpperCase()}
                </span>
              </div>
              <div className="booking-detail-row">
                <span className="booking-detail-label">Parking Space</span>
                <span className="booking-detail-value">
                  {selectedBookingDetails.space_title || `Space #${selectedBookingDetails.parking_space_id}`}
                </span>
              </div>
              {selectedBookingDetails.space_address && (
                <div className="booking-detail-row">
                  <span className="booking-detail-label">Address</span>
                  <span className="booking-detail-value">{selectedBookingDetails.space_address}</span>
                </div>
              )}
              <div className="booking-detail-row">
                <span className="booking-detail-label">Check-in</span>
                <span className="booking-detail-value">{formatDisplayDate(selectedBookingDetails.start_time)}</span>
              </div>
              <div className="booking-detail-row">
                <span className="booking-detail-label">Check-out</span>
                <span className="booking-detail-value">{formatDisplayDate(selectedBookingDetails.end_time)}</span>
              </div>
              <div className="booking-detail-row">
                <span className="booking-detail-label">Hourly Rate</span>
                <span className="booking-detail-value">₹{selectedBookingDetails.hourly_price || 75}/hr</span>
              </div>
              <div className="booking-detail-row" style={{ borderBottom: 'none', paddingTop: '4px' }}>
                <span className="booking-detail-label" style={{ fontSize: '13px', fontWeight: '700' }}>
                  Total Amount
                </span>
                <span className="booking-detail-value" style={{ fontSize: '17px', color: '#16835b' }}>
                  ₹{selectedBookingDetails.total_price}
                </span>
              </div>
              {selectedBookingDetails.driver_name && (
                <div className="booking-detail-row">
                  <span className="booking-detail-label">Driver</span>
                  <span className="booking-detail-value">
                    {selectedBookingDetails.driver_name} ({selectedBookingDetails.driver_email})
                  </span>
                </div>
              )}
              {selectedBookingDetails.owner_name && (
                <div className="booking-detail-row">
                  <span className="booking-detail-label">Space Owner</span>
                  <span className="booking-detail-value">
                    {selectedBookingDetails.owner_name} ({selectedBookingDetails.owner_email})
                  </span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              {selectedBookingDetails.status === 'confirmed' && (
                <button
                  className="cancel-booking-btn"
                  style={{ flex: 1, padding: '12px' }}
                  onClick={async () => {
                    await handleCancelBooking(selectedBookingDetails.id)
                    setActiveModal('my-bookings')
                  }}
                >
                  Cancel This Reservation
                </button>
              )}
              <button
                className="btn-secondary"
                style={{ flex: 1, padding: '12px' }}
                onClick={() => setActiveModal('my-bookings')}
              >
                Back to Reservations
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- OWNER PORTAL / LIST SPACE MODAL --- */}
      {activeModal === 'list-space' && (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)} role="dialog" aria-modal="true" aria-label="Owner Parking Portal">
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>{editingSpaceId ? 'Edit Parking Spot' : 'Owner Parking Portal'}</h3>
                <p>
                  {editingSpaceId
                    ? 'Update spot details, pricing, and photo'
                    : 'Publish spots and manage your active listings in Mumbai'}
                </p>
              </div>
              <button className="modal-close" onClick={() => setActiveModal(null)} aria-label="Close modal">
                ✕
              </button>
            </div>

            <div className="modal-tabs">
              <button
                className={`tab-btn ${ownerTab === 'create' ? 'active' : ''}`}
                onClick={() => setOwnerTab('create')}
              >
                {editingSpaceId ? '✎ Edit Spot' : '+ List New Spot'}
              </button>
              <button
                className={`tab-btn ${ownerTab === 'manage' ? 'active' : ''}`}
                onClick={() => {
                  setOwnerTab('manage')
                  loadOwnerSpaces()
                }}
              >
                Manage My Spots
              </button>
            </div>

            {spaceError && <div className="alert-error">{spaceError}</div>}

            {ownerTab === 'create' ? (
              <form onSubmit={handleListSpace}>
                <div className="form-group">
                  <label>Listing Title</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="e.g. Bandra Gated Resident Parking"
                    value={spaceTitle}
                    onChange={(e) => setSpaceTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Address / Location in Mumbai</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="e.g. 14th Road, Khar West, Mumbai"
                    value={spaceAddress}
                    onChange={(e) => setSpaceAddress(e.target.value)}
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Hourly Price (₹)</label>
                    <input
                      className="form-input"
                      type="number"
                      min="10"
                      max="1000"
                      value={spacePrice}
                      onChange={(e) => setSpacePrice(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Parking Icon</label>
                    <select
                      className="form-select"
                      value={spaceIcon.startsWith('spaces/') ? '📷' : spaceIcon}
                      onChange={(e) => {
                        setSpaceIcon(e.target.value)
                        setPhotoFile(null)
                        setPhotoPreview(null)
                      }}
                    >
                      <option value="🏢">🏢 Covered / Multi-level</option>
                      <option value="🅿️">🅿️ Dedicated / Gated</option>
                      <option value="🌆">🌆 Open Paved Spot</option>
                      <option value="🏖️">🏖️ Beachside / Commercial</option>
                      {spaceIcon.startsWith('spaces/') && <option value="📷">📷 Uploaded Photo</option>}
                    </select>
                  </div>
                </div>

                {/* S3 Photo Upload Box */}
                <div className="form-group">
                  <label>Spot Photo (Amazon S3 Presigned Upload)</label>
                  {photoPreview ? (
                    <div className="photo-preview">
                      <img src={photoPreview} alt="Spot Preview" />
                      <span>{photoFile ? photoFile.name : 'Selected Photo'}</span>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '10px' }}
                        onClick={() => {
                          setPhotoFile(null)
                          setPhotoPreview(null)
                          setSpaceIcon('🏢')
                        }}
                      >
                        ✕ Remove
                      </button>
                    </div>
                  ) : (
                    <div
                      className="photo-upload-box"
                      onClick={() => document.getElementById('photo-input')?.click()}
                    >
                      <input
                        id="photo-input"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/avif"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            if (file.size > 5 * 1024 * 1024) {
                              setSpaceError('Photo exceeds the 5MB file size limit.')
                              return
                            }
                            setPhotoFile(file)
                            setPhotoPreview(URL.createObjectURL(file))
                            setSpaceError(null)
                          }
                        }}
                      />
                      <div style={{ fontSize: '24px', marginBottom: '4px' }}>📷</div>
                      <strong style={{ fontSize: '12px', color: '#173e30' }}>
                        {uploadingPhoto ? 'Uploading to S3...' : 'Click to Upload Spot Photo'}
                      </strong>
                      <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#7a887d' }}>
                        JPEG, PNG, WEBP up to 5MB · Secured via AWS S3 Presigned PUT
                      </p>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label>Description & Access Instructions</label>
                  <textarea
                    className="form-textarea"
                    rows={3}
                    placeholder="e.g. Ground floor spot, guard on duty 24/7, suitable for SUVs."
                    value={spaceDescription}
                    onChange={(e) => setSpaceDescription(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                  <button
                    id="publish-space-btn"
                    className="form-submit"
                    type="submit"
                    disabled={spaceLoading || uploadingPhoto}
                    style={{ flex: 1, margin: 0 }}
                  >
                    {spaceLoading
                      ? 'Saving...'
                      : editingSpaceId
                        ? 'Save Changes ↗'
                        : 'Publish Parking Spot ↗'}
                  </button>
                  {editingSpaceId && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setEditingSpaceId(null)
                        setSpaceTitle('')
                        setSpaceAddress('')
                        setSpaceDescription('')
                        setPhotoFile(null)
                        setPhotoPreview(null)
                        setOwnerTab('manage')
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            ) : (
              <div>
                {loadingOwnerSpaces ? (
                  <p style={{ textAlign: 'center', padding: '20px' }}>Loading your listings...</p>
                ) : ownerSpaces.length === 0 ? (
                  <p style={{ textAlign: 'center', padding: '20px', color: '#79867c' }}>
                    You have not listed any parking spots yet.
                  </p>
                ) : (
                  <div>
                    {ownerSpaces.map((s) => (
                      <div className="space-manage-item" key={s.id}>
                        <div>
                          <h4>{s.title}</h4>
                          <p>
                            ⌖ {s.address} · ₹{s.hourly_price}/hr
                            {s.active_bookings !== undefined && (
                              <span style={{ marginLeft: '8px', color: '#16835b', fontWeight: '600' }}>
                                ({s.active_bookings} active booking{s.active_bookings === 1 ? '' : 's'})
                              </span>
                            )}
                          </p>
                          <span className={`badge-pill ${s.is_active ? 'badge-confirmed' : 'badge-cancelled'}`}>
                            {s.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <div className="space-manage-actions">
                          <button
                            type="button"
                            className="btn-edit-space"
                            onClick={() => handleStartEditSpace(s)}
                          >
                            Edit
                          </button>
                          {s.is_active && (
                            <button
                              type="button"
                              className="cancel-booking-btn"
                              onClick={() => handleDeactivateSpace(s.id)}
                            >
                              Deactivate
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
