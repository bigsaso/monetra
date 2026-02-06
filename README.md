# Monetra

Personal finance management application for tracking net worth, investments, transactions, budgets, and employee equity compensation (ESPP/RSU).

## Structure

- `frontend/`: Next.js 14 + React 18 + TypeScript + TailwindCSS
- `backend/`: FastAPI + SQLAlchemy + PostgreSQL
- `docker-compose.yml`: Local development stack

## Quick Start

### 1. Create Environment File

Create a `.env` file at the repo root. You can copy from the example:

```bash
cp .env.example .env
```

Or create it manually with the following content:

```bash
# NextAuth Configuration
NEXTAUTH_SECRET=replace-with-a-long-random-string
NEXTAUTH_URL=http://localhost:3000

# Application Settings
DEFAULT_CURRENCY=USD
ALPHAVANTAGE_API_KEY=your-api-key-here

# Backend URLs
BACKEND_URL=http://backend:8000
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000

# CORS Configuration
FRONTEND_ORIGIN=http://localhost:3000
```

### 2. Start Services

```bash
docker compose up -d
```

### 3. Access Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- PostgreSQL: localhost:5433

## Environment Variables

### Required Variables

**Authentication & Security:**

- **`NEXTAUTH_SECRET`**: Secret key for encrypting NextAuth tokens and sessions
  - Generate with: `openssl rand -base64 32`
  - Must be a long random string (32+ characters)
  - **Required** for authentication to work

- **`NEXTAUTH_URL`**: The canonical URL where your frontend is accessible
  - Example: `http://localhost:3000` (local development)
  - Example: `http://your-domain.com` (production)
  - Must match where users access your app

**Application Settings:**

- **`DEFAULT_CURRENCY`**: Default currency code (ISO 4217) for the application
  - Examples: `USD`, `CAD`, `EUR`, `GBP`
  - Used when no user preference is set

- **`ALPHAVANTAGE_API_KEY`**: API key for stock market data
  - Get a free key at: https://www.alphavantage.co/support/#api-key
  - Used for fetching real-time stock quotes and FX rates

**Backend URLs:**

- **`BACKEND_URL`**: Backend URL for **server-side** Next.js API routes
  - Use `http://backend:8000` when running in Docker
  - Use `http://localhost:8000` for local development outside Docker
  - This URL is used inside the Docker network

- **`NEXT_PUBLIC_BACKEND_URL`**: Backend URL for **client-side** (browser) requests
  - Must be accessible from the user's browser
  - Example: `http://localhost:8000` (local development)
  - Example: `http://your-hostname:8000` (custom hostname)
  - **Important**: The `NEXT_PUBLIC_` prefix makes this available to browser JavaScript
  - **Important**: After changing this, rebuild frontend: `docker compose build --no-cache frontend`

**CORS Configuration:**

- **`FRONTEND_ORIGIN`**: Frontend origin for CORS policy
  - Must exactly match your frontend URL (protocol + hostname + port)
  - Example: `http://localhost:3000` (local development)
  - Example: `http://your-hostname:3000` (custom hostname)
  - After changing this, restart backend: `docker compose restart backend`

### Configuration Examples

**Local Development (localhost):**
```bash
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
FRONTEND_ORIGIN=http://localhost:3000
```

**Custom Hostname (e.g., testbench):**
```bash
NEXTAUTH_URL=http://testbench:3000
NEXT_PUBLIC_BACKEND_URL=http://testbench:8000
FRONTEND_ORIGIN=http://testbench:3000
```

**Production:**
```bash
NEXTAUTH_URL=https://your-domain.com
NEXT_PUBLIC_BACKEND_URL=https://api.your-domain.com
FRONTEND_ORIGIN=https://your-domain.com
```

## Common Commands

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f

# Rebuild services after code changes
docker compose build

# Rebuild frontend (required after changing NEXT_PUBLIC_* variables)
docker compose build --no-cache frontend

# Restart backend (required after changing FRONTEND_ORIGIN)
docker compose restart backend

# Check service status
docker compose ps

# Stop services
docker compose down

# Stop and remove volumes (fresh start)
docker compose down -v
```

## Service URLs

**When using localhost:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- PostgreSQL: localhost:5433

**When using custom hostname:**
- Frontend: http://your-hostname:3000
- Backend API: http://your-hostname:8000
- PostgreSQL: your-hostname:5433

## Health Checks

- Frontend: http://localhost:3000/api/health
- Backend: http://localhost:8000/health

## Important Notes

- Never commit `.env` files to version control
- After changing `NEXT_PUBLIC_BACKEND_URL`, you **must rebuild** the frontend
- After changing `FRONTEND_ORIGIN`, restart the backend
- Generate a strong `NEXTAUTH_SECRET` for production (use `openssl rand -base64 32`)
- The `.env.example` file provides a template with all required variables
