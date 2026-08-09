// ponytail: dev fallbacks; real deployments must set JWT_SECRET in .env
export const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';
// Where the verify link redirects after a successful click (the SPA origin).
export const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';
// How long before a booking's end its author is notified when the next slot
// is taken (spec: NOTIFY_BEFORE_MINUTES, default 10).
export const NOTIFY_BEFORE_MINUTES = Number(process.env.NOTIFY_BEFORE_MINUTES ?? 10);
