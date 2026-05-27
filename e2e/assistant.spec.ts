import { test, expect } from '@playwright/test';
import { loginAsPro, seedCampaign } from './helpers';

// Appendix F of the Campaign Assistant spec. Marked `test.fixme` for the same
// reason as the Scene Mode E2E: this repo's Playwright harness boots with CI
// dummy Firebase config and exercises only the unauthenticated surface — there
// is no emulator-backed Pro session or campaign seeding here (see
// e2e/helpers.ts). The Assistant's pure logic (snapshot builder, read tools,
// write application, conversation capping) is unit-tested in
// lib/__tests__/assistant.test.ts. Un-fixme these once the auth/seed harness
// lands.

test.fixme('Assistant answers from real campaign data', async ({ page }) => {
  await loginAsPro(page);
  const { campaignId } = await seedCampaign(page, {
    npcs: [
      { id: 'npc-1', name: 'Inka', traits: 'Wary innkeeper' },
      { id: 'npc-2', name: 'Hara', traits: 'Smuggler captain' },
    ],
    sessions: [{ id: 'sess-1', transcript: [{ text: 'The party met @Inka.' }] }],
  });

  await page.goto(`/campaign/${campaignId}`);
  await page.getByRole('button', { name: 'Assistant' }).click();
  await page.getByRole('button', { name: 'New Conversation' }).click();
  await page.fill('[data-assistant-input]', 'Who have I not used recently?');
  await page.getByRole('button', { name: 'Send' }).click();

  await page.waitForSelector('[data-assistant-response][data-status="complete"]', {
    timeout: 30_000,
  });
  await expect(page.getByText('Hara')).toBeVisible();
});

test.fixme('Write tool requires approval', async ({ page }) => {
  await loginAsPro(page);
  const { campaignId } = await seedCampaign(page, {});
  await page.goto(`/campaign/${campaignId}`);
  await page.getByRole('button', { name: 'Assistant' }).click();
  await page.getByRole('button', { name: 'New Conversation' }).click();
  await page.fill('[data-assistant-input]', 'Propose a new NPC named "Garrick the Smith".');
  await page.getByRole('button', { name: 'Send' }).click();

  await page.waitForSelector('[data-proposal][data-tool="createNpc"]', { timeout: 30_000 });
  // NPC list should NOT yet contain Garrick.
  await page.goto(`/campaign/${campaignId}`);
  await expect(page.getByText('Garrick')).not.toBeVisible();

  // Approve.
  await page.goto(`/campaign/${campaignId}`);
  await page.getByRole('button', { name: 'Assistant' }).click();
  await page.getByRole('button', { name: 'Approve' }).click();

  await page.goto(`/campaign/${campaignId}`);
  await expect(page.getByText('Garrick')).toBeVisible();
});

test.fixme('Rate limit enforced', async ({ page }) => {
  await loginAsPro(page, { usageOverride: { assistant: 50 } });
  await page.goto('/campaign/test');
  await page.getByRole('button', { name: 'Assistant' }).click();
  await page.getByRole('button', { name: 'New Conversation' }).click();
  await page.fill('[data-assistant-input]', 'hi');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/Daily limit reached/i)).toBeVisible();
});
