# Meeting Rooms

A small web app for booking meeting rooms in an office. Employees open a room's
weekly schedule, see occupied slots, and book free time. Own bookings can be
cancelled; other people's cannot.

UA-Skills event2 contest entry.

## Tech Stack

- **Frontend:** React 19 + Vite + TypeScript, Tailwind CSS
- **Backend:** Express 5 + TypeScript
- **Database:** SQLite (better-sqlite3)
- **Auth:** JWT in an httpOnly cookie, bcrypt password hashing
- **Tests:** Vitest (`npm test`)

## Prerequisites

- Node.js 22+
- npm 10+

## Getting Started

```bash
npm install
npm run dev
```

- Frontend: http://localhost:3000
- API: http://localhost:8080 — health check: `GET /api/health`

Both apps start from one command; the Vite dev server proxies `/api` to the backend.

## Configuration

All settings live in environment variables with safe defaults. To override,
copy `backend/.env.example` to `backend/.env` and adjust:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | API port |
| `JWT_SECRET` | `change-me` | Secret for signing session cookies |
| `DB_PATH` | `./data/meeting-rooms.db` | SQLite database file |

## Seeds

_TODO: filled in with the booking core (rooms, test users, demo bookings)._

```bash
npm run seed
```

## Test Users

_TODO: credentials will be listed here (see spec requirement)._

## Bonus Features Implemented

_TODO: list will grow as features land._
