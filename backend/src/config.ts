// ponytail: dev fallbacks; real deployments must set JWT_SECRET in .env
export const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';
// Where the verify link redirects after a successful click (the SPA origin).
export const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';
