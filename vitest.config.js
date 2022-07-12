import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    clearMocks: true,
    globals: true,
    environment: 'node',
    testTimeout: 150000,
  },
});
