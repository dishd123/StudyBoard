import { defineConfig } from 'vitest/config';

// Keep tests separate from the production config's static-file copying hook.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['frontend/tests/**/*.test.{js,jsx}']
  }
});
