import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Cold module graph (express, bcrypt, jwt, sqlite) can exceed the 10s
    // default on slower machines, especially with parallel forks.
    hookTimeout: 30_000,
    // NODE_ENV=test is what the auth rate limiter's skip() checks — vitest
    // doesn't set it itself, and without it every integration suite that
    // logs in from one IP would hit 429.
    env: { NODE_ENV: 'test' },
  },
});
