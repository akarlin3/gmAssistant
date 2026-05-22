import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/cypress/**', '**/.{idea,git,cache,output,temp}/**', 'lib/generators/__tests__/*.test.ts'], // EXCLUDE node native tests from vitest
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
