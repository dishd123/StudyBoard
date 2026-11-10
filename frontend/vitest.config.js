import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Keep tests separate from the production config's static-file copying hook.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{js,jsx}']
  }
});
