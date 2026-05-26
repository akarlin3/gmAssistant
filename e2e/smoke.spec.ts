import { test, expect } from '@playwright/test';

// Smoke coverage for the unauthenticated surface. These don't require a real
// Firebase backend — they assert the app boots, the root redirects to login,
// and the sign-in screen renders its primary affordance.

test('root redirects unauthenticated visitors to /login', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL('**/login');
  await expect(page).toHaveURL(/\/login$/);
});

test('login screen renders the Google sign-in affordance', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
});
