# Meeting Rooms

A small web app for booking meeting rooms in an office. Employees open a room's
weekly schedule, see occupied slots, and book free time. Own bookings can be
cancelled; other people's cannot.

UA-Skills event2 contest entry.

## Tech Stack

- **Frontend:** React 19 + Vite + TypeScript, hand-written CSS
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

## Docker

One command brings up the whole app — API, SPA and a seeded SQLite database:

```bash
docker compose up --build
```

- App: http://localhost:3000 (the API lives on the same origin — no CORS setup)
- The SQLite database lives in a Docker volume and is seeded automatically on
  first start (6 rooms, test users, demo bookings) — no manual steps
- Reset the data: `docker compose down -v && docker compose up --build`

## Configuration

All settings live in environment variables with safe defaults. To override,
copy `backend/.env.example` to `backend/.env` and adjust:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | API port |
| `JWT_SECRET` | `dev-secret-change-me` | Secret for signing session cookies |
| `DB_PATH` | `./data/meeting-rooms.db` | SQLite database file |
| `FRONTEND_URL` | `http://localhost:3000` | Origin the email-verify link redirects to |
| `NOTIFY_BEFORE_MINUTES` | `10` | Notify the booking author this many minutes before its end (when the next slot is taken) |

## Seeds

Creates 6 rooms (Mercury, Mars, Venus, Earth, Jupiter, Saturn), 2 test users
and demo bookings. Idempotent — safe to re-run.

```bash
npm run seed
```

## Test Users

| Name | Email | Password |
|---|---|---|
| Alice | `alice@example.com` | `alice12345` |
| Bob | `bob@example.com` | `bob12345` |

All times are stored as UTC instants (`start_at` / `end_at`). The UI renders
them in the browser's timezone, so a user in Berlin sees the same Kyiv
schedule shifted by their offset. Working hours (09:00–19:00) are validated
in Europe/Kyiv on the server, regardless of where the user is; 30-minute
alignment is checked on UTC minutes, which keeps it DST-safe.

A booking is rejected when it overlaps an existing one (`start_at < new_end
AND end_at > new_start` — strict, so touching bookings are fine). The check
is part of the INSERT itself (`WHERE NOT EXISTS`), making it atomic: two
concurrent requests for one slot can't both pass, the second inserts 0 rows
and gets a 409. The same statement is the race protection.

## Bonus Features Implemented

- **Docker compose** — `docker compose up --build` runs the API, the built
  SPA and a seeded SQLite database (see above).
- **Dev-mode email verification** — after registering, the verification link
  is printed to the server log (no real SMTP needed). Booking is blocked
  until the email is verified.
- **Weekly recurring bookings** — book "every week, N times" (2–52) from the
  booking modal; a series can be cancelled as a whole or one occurrence at a
  time; a single booking can be turned into a series or extended from
  "My bookings".
- **Race protection** — the overlap check and the insert are one atomic SQL
  statement, so two concurrent requests for the same slot can't both pass.
- **End-of-booking notifications** — when the next slot in the room is taken,
  the author of the current booking gets an in-app toast N minutes before it
  ends (`NOTIFY_BEFORE_MINUTES`, default 10). Delivered alerts are recorded,
  so each notification fires exactly once, and the check reads live data —
  cancelling either booking stops it.
- **API integration tests** — creating and cancelling bookings, validation
  rejections, ownership rules (supertest + Vitest).
- **Capacity filter** — the room picker filters rooms by minimum capacity
  (`GET /api/rooms?capacity=N`).
- **Mobile-friendly schedule** *(partial)* — a collapsible menu, touch swipe
  between room cards on the home page and stacked booking rows on narrow
  screens; the weekly grid itself stays desktop-oriented.

## License

MIT — see [LICENSE](LICENSE).
