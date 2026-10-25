# ParkShare Cloud 🚗🅿️

[![Tests](https://img.shields.io/badge/tests-36%20passed-brightgreen.svg)]()
[![React](https://img.shields.io/badge/React-19.3-blue.svg)]()
[![Node.js](https://img.shields.io/badge/Node.js-25.x-green.svg)]()
[![Express](https://img.shields.io/badge/Express-5.3-lightgrey.svg)]()
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-blue.svg)]()
[![AWS](https://img.shields.io/badge/AWS-S3%20%7C%20SNS%20%7C%20RDS-orange.svg)]()

> A modern, cloud-native smart parking reservation platform designed for urban hubs. Discover verified parking spots, book slots with transactional conflict-prevention locking, manage owner listings with AWS S3 photo uploads, and receive asynchronous AWS SNS alerts.

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

## ☁️ AWS Production Deployment Blueprint

For high-availability production deployment on AWS:
1. **Networking**: Custom Amazon VPC with 2 Public Subnets (ALB, NAT) and 2 Private Subnets (EC2, RDS).
2. **Compute**: Amazon EC2 instances managed by an Auto Scaling Group behind an Application Load Balancer (ALB).
3. **Database**: Amazon RDS for PostgreSQL in private subnets with automated backups and `sslmode=require`.
4. **Storage & Media**: Amazon S3 bucket with CORS configuration allowing presigned PUT requests from the frontend domain.
5. **Secrets & Config**: AWS Systems Manager Parameter Store or AWS Secrets Manager storing `DATABASE_URL` and `JWT_SECRET`.
6. **Monitoring**: Amazon CloudWatch log groups and metric alarms for HTTP 5xx rates and EC2 CPU utilization.

---

## 📄 License
This project is licensed under the ISC License.
