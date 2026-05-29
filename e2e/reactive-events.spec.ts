import { test, expect } from '@playwright/test';

test.describe('Reactive World Events Sandboxed E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Open the sandbox route and ensure clean state
    await page.goto('/e2e-sandbox');
    const resetBtn = page.getByRole('button', { name: /Reset Sandbox/i });
    if (await resetBtn.isVisible()) {
      await resetBtn.click();
    }
  });

  test('Approve Path: npc death propagates proposal, approval mutates and persists weight across reload', async ({ page }) => {
    // 1. Verify initial states
    await expect(page.getByTestId('npc-name-status')).toContainText('Inka: Active');
    await expect(page.getByTestId('edge-weight')).toContainText('0.80');
    await expect(page.getByText('No pending proposals')).toBeVisible();

    // 2. Transition NPC to dead
    await page.getByTestId('toggle-dead-btn').click();

    // 3. Verify proposal surfaces in the live UI
    await expect(page.getByTestId('npc-name-status')).toContainText('Inka: Dead');
    await expect(page.getByText('No pending proposals')).not.toBeVisible();
    await expect(page.locator('span').filter({ hasText: 'NPC death ripple' }).first()).toBeVisible();
    await expect(page.getByText('anchor Inka')).toBeVisible();

    // 4. Click Approve to commit changes
    await page.getByRole('button', { name: /Approve/i }).click();

    // 5. Verify the proposal is accepted and the relationship weight changed
    await expect(page.getByText('No pending proposals')).toBeVisible();
    await expect(page.getByTestId('edge-weight')).toContainText('0.40');

    // 6. Reload the page to test sessionStorage persistence
    await page.getByRole('button', { name: /Force Page Reload/i }).click();

    // 7. Verify the changes are fully persisted across page reload
    await expect(page.getByTestId('npc-name-status')).toContainText('Inka: Dead');
    await expect(page.getByTestId('edge-weight')).toContainText('0.40');
    await expect(page.getByText('No pending proposals')).toBeVisible();
  });

  test('Reject Path: npc death propagates proposal, rejection discards it with no canonical weight changes', async ({ page }) => {
    // 1. Verify initial states
    await expect(page.getByTestId('npc-name-status')).toContainText('Inka: Active');
    await expect(page.getByTestId('edge-weight')).toContainText('0.80');

    // 2. Transition NPC to dead
    await page.getByTestId('toggle-dead-btn').click();
    await expect(page.locator('span').filter({ hasText: 'NPC death ripple' }).first()).toBeVisible();

    // 3. Click Reject to discard proposal
    await page.getByRole('button', { name: /Reject/i }).click();

    // 4. Verify proposal is removed and relationship weight is unchanged
    await expect(page.getByText('No pending proposals')).toBeVisible();
    await expect(page.getByTestId('edge-weight')).toContainText('0.80');

    // 5. Reload and double-check no regression occurred
    await page.getByRole('button', { name: /Force Page Reload/i }).click();
    await expect(page.getByTestId('npc-name-status')).toContainText('Inka: Dead');
    await expect(page.getByTestId('edge-weight')).toContainText('0.80');
  });
});
