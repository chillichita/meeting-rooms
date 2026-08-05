// ponytail: dev fallback; real deployments must set JWT_SECRET in .env
export const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';
