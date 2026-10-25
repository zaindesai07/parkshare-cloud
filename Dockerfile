# Multi-stage Dockerfile for ParkShare Cloud
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency specifications
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/
COPY package*.json ./

# Install dependencies and build frontend SPA
RUN npm --prefix backend install --omit=dev && \
    npm --prefix frontend install

COPY . .

RUN npm --prefix frontend run build

# Runtime Stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5050
ENV HOST=0.0.0.0

COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/frontend/dist ./frontend/dist
COPY backend ./backend
COPY deployment ./deployment
COPY package*.json ./

EXPOSE 5050

CMD ["npm", "start"]
