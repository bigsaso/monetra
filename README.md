# Monetra

Project bootstrap with a Next.js frontend, FastAPI backend, and Postgres.

## Structure

- `frontend/`: Next.js app
- `backend/`: FastAPI app
- `docker-compose.yml`: Local stack (frontend, backend, postgres)

## Quick start

1. Create a `.env` file at the repo root with the frontend/runtime settings:

```bash
NEXTAUTH_SECRET=replace-with-a-long-random-string
NEXTAUTH_URL=http://localhost:3000
BACKEND_URL=http://backend:8000
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

Notes:
- `NEXTAUTH_SECRET` is required for NextAuth; use a long random value.
- `BACKEND_URL` is used by server-side Next.js routes inside Docker.
- `NEXT_PUBLIC_BACKEND_URL` is used by the browser to reach the backend.

```bash
docker compose up --build
```

## Services

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- Postgres: localhost:5432

## Health checks

- Frontend: http://localhost:3000/api/health
- Backend: http://localhost:8000/health
