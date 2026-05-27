import { test, expect } from '@playwright/test';
import { loginAsPro, seedCampaign } from './helpers';

// NOTE: The two authenticated flows below follow Appendix H of the Scene Mode
// spec. They are marked `test.fixme` because this repo's Playwright harness
// boots with CI dummy Firebase config and exercises only the unauthenticated
// surface — there's no emulator-backed Pro session or campaign seeding here
// (see e2e/helpers.ts). The Scene Mode pure logic is unit-tested under
// lib/scene/__tests__. Un-fixme these once the auth/seed harness lands.

test.fixme('Scene Mode happy path', async ({ page }) => {
  await loginAsPro(page);
  const { campaignId } = await seedCampaign(page, {
    locations: [{ id: 'loc-tavern', name: 'The Salt Wheel', description: 'A coastal inn.' }],
    npcs: [
      { id: 'npc-inn', name: 'Inka', traits: 'Wary, observant.', voice: 'Curt.' },
      { id: 'npc-stranger', name: 'The Stranger', traits: 'Hooded, soft-spoken.', voice: 'Quiet.' },
    ],
  });

  await page.goto(`/campaign/${campaignId}`);
  await page.getByRole('tab', { name: 'Scene Mode' }).click();
  await page.getByRole('button', { name: 'Start Scene' }).click();

  await page.selectOption('select[name="locationId"]', 'loc-tavern');
  await page.getByRole('checkbox', { name: 'Inka' }).check();
  await page.getByRole('checkbox', { name: 'The Stranger' }).check();
  await page.fill('textarea[name="partyState"]', 'just arrived from the cliffs');
  await page.getByRole('button', { name: 'Begin' }).click();

  for (let i = 0; i < 5; i++) {
    await page.fill('textarea[name="pcAction"]', `I look around carefully. Turn ${i + 1}.`);
    await page.getByRole('button', { name: 'Send' }).click();
    await page.waitForSelector(`[data-turn-index="${i}"][data-status="complete"]`, {
      timeout: 30_000,
    });
  }

  await page.getByRole('button', { name: 'End Scene' }).click();
  await page.waitForSelector('[data-scene-status="ended"]');

  await page.getByRole('tab', { name: 'Sessions' }).click();
  await expect(page.getByText(/Scene at The Salt Wheel/i)).toBeVisible();
});

test.fixme('Scene Mode is gated for non-Pro', async ({ page }) => {
  await page.goto('/campaign/test');
  await page.getByRole('tab', { name: 'Scene Mode' }).click();
  await expect(page.getByText(/Join the Pro waitlist/i)).toBeVisible();
});
