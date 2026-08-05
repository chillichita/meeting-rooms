import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Cold module graph (express, bcrypt, jwt, sqlite) can exceed the 10s
    // default on slower machines, especially with parallel forks.
    hookTimeout: 30_000,
  },
});
