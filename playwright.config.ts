import { defineConfig, devices } from '@playwright/test';

// E2E config. The dev server is started automatically with stable CI dummy
// Firebase config (public NEXT_PUBLIC_* values) so the app boots without real
// secrets. Auth-gated flows are out of scope for these smoke tests — they
// cover the unauthenticated surface (landing redirect, login screen).
const PORT = 3100;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_FIREBASE_API_KEY: 'ci-dummy-api-key',
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'ci-dummy.firebaseapp.com',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'ci-dummy-project',
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'ci-dummy.appspot.com',
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
      NEXT_PUBLIC_FIREBASE_APP_ID: '1:000000000000:web:cidummy',
    },
  },
});
