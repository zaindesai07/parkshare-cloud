# ParkShare Cloud 🚗🅿️

[![Live Website](https://img.shields.io/badge/Live%20Website-parkshare--cloud.onrender.com-success.svg?style=for-the-badge&logo=render)](https://parkshare-cloud.onrender.com)
[![GitHub Repo](https://img.shields.io/badge/GitHub-zaindesai07%2Fparkshare--cloud-blue.svg?style=for-the-badge&logo=github)](https://github.com/zaindesai07/parkshare-cloud)
[![Tests](https://img.shields.io/badge/tests-36%20passed-brightgreen.svg)]()
[![React](https://img.shields.io/badge/React-19.3-blue.svg)]()
[![Express](https://img.shields.io/badge/Express-5.3-lightgrey.svg)]()
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%2B-blue.svg)]()

> A modern, cloud-native smart parking reservation platform designed for urban hubs. Discover verified parking spots, book slots with transactional conflict-prevention locking, manage owner listings with AWS S3 photo uploads, and receive asynchronous AWS SNS alerts.

**🌐 Live Public Website:** [https://parkshare-cloud.onrender.com](https://parkshare-cloud.onrender.com)  
**🩺 Backend Health Check:** [https://parkshare-cloud.onrender.com/health](https://parkshare-cloud.onrender.com/health)  
**🗄️ Database Health Check:** [https://parkshare-cloud.onrender.com/api/db-health](https://parkshare-cloud.onrender.com/api/db-health)  
**📦 GitHub Repository:** [https://github.com/zaindesai07/parkshare-cloud](https://github.com/zaindesai07/parkshare-cloud)  

### 👤 Demo Accounts (Instant Quick-Login)
* **Demo Driver:** `driver@parkshare.com` / `Password123!`
* **Demo Owner:** `owner@parkshare.com` / `Password123!`

---

## 🏗️ System Architecture

```text
                                +-----------------------------+
                                |      React 19 + Vite        |
                                |     (Single Page App)       |
                                +--------------+--------------+
                                               |
                                     HTTPS REST API calls
                                               v
                                +-----------------------------+
                                |     Express 5 API Server    |
                                |   (Rate Limiter + Security) |
                                +--+---------+-------------+--+
                                   |         |             |
                 +-----------------+         |             +-----------------+
                 v                           v                               v
    +-------------------------+  +-----------------------+     +-------------------------+
    |   PostgreSQL Database   |  |   Amazon Simple       |     |   Amazon S3 (Photos)    |
    |  - Row-Level Locks      |  |   Notification (SNS)  |     |  - Presigned PUT URLs   |
    |  - B-Tree Composite Idx |  |  - Booking & Cancel   |     |  - Scoped Owner Keys    |
    |  - Check Constraints    |  |  - Async / Non-block  |     |  - 5MB Strict Limit     |
    +-------------------------+  +-----------------------+     +-------------------------+
```

---

## ✨ Features

### 1. 🔍 Intelligent Parking Discovery & Search
- **Keyword & Location Filtering**: Real-time ILIKE parameterized queries matching across spot titles, addresses, and descriptions.
- **Price Range Bounds**: Filter listings by minimum and maximum hourly rates.
- **Availability Window Filtering**: Search for slots available during specific dates/times (`start_time` and `end_time`).

### 2. 🔒 Transactional Concurrency & Overlap Prevention
- **Row-Level Serialization**: Booking creation executes within an isolated PostgreSQL transaction acquiring an exclusive lock (`SELECT ... FOR UPDATE` on `parking_spaces`).
- **Conflict Detector**: Eliminates double-booking race conditions; simultaneous overlapping booking attempts immediately receive `HTTP 409 Conflict`.
- **Clock Drift & Boundaries**: Validates that reservations cannot be booked in the past or cancelled after the reservation has concluded. Owners are prevented from booking their own spaces.

### 3. ⏱️ Idempotent Booking Lifecycle Automation
- **Automatic Status Synchronization**: Scheduled background worker and `POST /api/bookings/sync-completed` endpoint automatically transition confirmed bookings to `'completed'` once `end_time <= NOW()`.
- Safe to re-run repeatedly with zero side effects.

### 4. 📸 AWS S3 Presigned Photo Uploads
- **Least-Privilege Upload Authorization**: Server-generated presigned S3 PUT URLs via `@aws-sdk/s3-request-presigner`.
- **Strict Validation**: Rejects files exceeding 5MB and non-image MIME types.
- **Safe Scoped Keys**: Prevents path traversal and arbitrary key injection; object keys are restricted to `spaces/owner-${ownerId}/...`.
- **Offline / Local Fallback**: Operates seamlessly in local development when AWS credentials are absent without crashing or incurring charges.

### 5. 📢 AWS SNS Reservation Notifications
- **Async Confirmation & Cancellation Alerts**: Drivers and owners receive alerts upon reservation creation and cancellation.
- **Transaction Isolation**: Dispatched in background tasks so an AWS SNS failure never disrupts core database transactions.
- **Test Mode Protection**: Zero charges or live SMS dispatches during test and local runs.

### 6. 🛡️ DevSecOps & Security Hardening
- **Authentication**: Bcrypt password hashing (10 rounds, 128-char limit preventing CPU exhaustion DoS) and JWT bearer tokens with expiration.
- **Rate Limiting**: In-memory rate limiter on `/api/auth/register` and `/api/auth/login` returning `HTTP 429` with `RateLimit-*` and `Retry-After` headers.
- **HTTP Security Headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.
- **Authorization Boundaries**: Strict role checks (`driver`, `owner`, `admin`); unauthorized users are blocked from viewing or cancelling other users' bookings (HTTP 403).

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, Vite 8, Vanilla CSS Design System, Google Fonts (DM Sans, Space Grotesk) |
| **Backend** | Node.js 25, Express 5, CORS, Dotenv, Bcrypt, JsonWebToken |
| **Database** | PostgreSQL 14+, pg pool, ACID Transactions, Row-Level Locking |
| **Cloud (AWS)** | AWS SDK v3 (S3, S3 Presigner, SNS, SSM Parameter Store), RDS, EC2, ALB |
| **Testing & Quality** | Custom Integration Test Suite, Node.js Native Test Runner (`node:test`), Oxlint |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18+ (Node 22 or 25 recommended)
- **PostgreSQL**: v14+ running locally or in Docker
- **Git**

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/zaindesai07/parkshare-cloud.git
cd parkshare-cloud

# Install backend dependencies
npm --prefix backend install

# Install frontend dependencies
npm --prefix frontend install
```

### 2. Configure Environment Variables

Create `.env` in `backend/` and `frontend/` using the provided `.env.example` templates:

**Backend (`backend/.env`):**
```ini
PORT=5050
HOST=0.0.0.0
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
JWT_SECRET=super_secret_jwt_key_for_local_dev_2026

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=parkshare
DB_USER=postgres
DB_PASSWORD=your_password
DB_SSL=false

# AWS Services (Optional for local dev - mock mode runs automatically)
AWS_REGION=ap-south-1
AWS_S3_BUCKET=parkshare-spaces-bucket
AWS_SNS_TOPIC_ARN=arn:aws:sns:ap-south-1:123456789012:parkshare-booking-notifications
```

**Frontend (`frontend/.env`):**
```ini
VITE_API_URL=http://localhost:5050/api
```

### 3. Initialize Database Schema & Seed Demo Data

```bash
# Execute schema in your PostgreSQL database
psql -d parkshare -f backend/schema.sql

# Seed initial parking spaces and demo accounts (owner & driver)
npm --prefix backend run seed
```

### 4. Run the Development Servers

```bash
# Start backend API (runs at http://localhost:5050)
npm --prefix backend run dev

# In a separate terminal, start frontend (runs at http://localhost:5173)
npm --prefix frontend run dev
```

---

## 🧪 Testing & Code Quality

### Automated Test Suites

```bash
# Run backend system integration test suite (32 tests covering Auth, Concurrency, S3, SNS, Bookings)
npm --prefix backend test

# Run frontend storage & state unit tests (4 tests)
npm --prefix frontend test

# Run linter
npm --prefix frontend run lint

# Build production bundle
npm --prefix frontend run build
```

---

## 📦 Database Schema Overview

```sql
-- Users
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'driver' CHECK (role IN ('driver', 'owner', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Parking Spaces
CREATE TABLE parking_spaces (
    id BIGSERIAL PRIMARY KEY,
    owner_id BIGINT NOT NULL REFERENCES users(id),
    title VARCHAR(150) NOT NULL,
    description TEXT,
    address TEXT NOT NULL,
    latitude NUMERIC(9,6) NOT NULL,
    longitude NUMERIC(9,6) NOT NULL,
    hourly_price NUMERIC(10,2) NOT NULL CHECK (hourly_price >= 0),
    image_key TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bookings
CREATE TABLE bookings (
    id BIGSERIAL PRIMARY KEY,
    parking_space_id BIGINT NOT NULL REFERENCES parking_spaces(id),
    driver_id BIGINT NOT NULL REFERENCES users(id),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    total_price NUMERIC(10,2) NOT NULL CHECK (total_price >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (end_time > start_time)
);
```

---

---

## ☁️ Cloud & Production Deployment

ParkShare Cloud is configured for seamless deployment across modern cloud platforms with zero lock-in:

### Option 1: 1-Click Render Deployment (Recommended for Instant Public HTTPS)

The repository includes a production [`render.yaml`](render.yaml) Blueprint that automatically provisions:
* A high-performance Node.js Web Service (running Express + React 19 SPA)
* A dedicated managed PostgreSQL database
* Automatic SSL/TLS HTTPS certificates
* Dynamic secret generation for `JWT_SECRET` and internal database wiring

**Deploy Steps**:
1. Fork or push to your GitHub account (`zaindesai07/parkshare-cloud`).
2. Log in to [Render.com](https://render.com).
3. Click **New +** -> **Blueprint**.
4. Connect the `parkshare-cloud` repository.
5. Render will detect `render.yaml` and provision both the Web Service and PostgreSQL database automatically.
6. Your live public application is immediately available at `https://<your-service-name>.onrender.com`.

### Option 2: Docker / Container Deployment

A multi-stage [`Dockerfile`](Dockerfile) is included for containerized environments:

```bash
# Build the container
docker build -t parkshare-cloud .

# Run with your PostgreSQL connection string
docker run -d -p 5050:5050 \
  -e DATABASE_URL="postgres://user:password@host:5432/parkshare?sslmode=require" \
  -e JWT_SECRET="your-secure-jwt-key" \
  -e DB_SSL="true" \
  --name parkshare \
  parkshare-cloud
```

### Option 3: AWS Enterprise Cloud Architecture

The repository includes a complete CloudFormation template [`deployment/cloudformation-template.yaml`](deployment/cloudformation-template.yaml):
1. **Networking**: Custom Amazon VPC (`10.0.0.0/16`) with 2 Public Subnets and 2 Private Subnets.
2. **Compute**: Amazon EC2 (`t3.micro`) running Node 22 LTS, PM2, and Nginx.
3. **Load Balancing**: Application Load Balancer (ALB) across 2 Availability Zones.
4. **Database**: Amazon RDS for PostgreSQL in private subnets with strict security groups.
5. **Storage & Notifications**: Amazon S3 bucket for owner photo uploads and Amazon SNS for booking alerts.
6. **IAM & Secrets**: Dedicated least-privilege IAM Role and AWS Systems Manager Parameter Store.

---

## 📄 License
This project is licensed under the ISC License.
