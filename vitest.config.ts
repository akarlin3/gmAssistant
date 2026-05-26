import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/cypress/**', '**/.{idea,git,cache,output,temp}/**', 'lib/generators/__tests__/*.test.ts', 'lib/__tests__/*.test.ts', 'e2e/**'], // EXCLUDE node native tests + Playwright e2e from vitest
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
