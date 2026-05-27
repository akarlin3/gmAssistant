import { test, expect } from '@playwright/test';

// NPC Voice synthesis (TTS) — happy-path E2E, written against the real UI
// selectors. Audio is produced entirely in the browser via the Web Speech API
// (window.speechSynthesis) — no API key, no server route, no quota:
//   - NPC card → "Voice" section → select[name="voiceId"], rate/pitch sliders,
//     "Preview" / "Save Voice", [data-voice-preview-played]
//   - Scene Mode → turn dialogue auto-plays ([data-voice-autoplay-fired]),
//     header "Voices"/"Muted" toggle + "Skip"
//
// SKIPPED: like the Scene Mode and Living World suites, these steps require an
// authenticated Pro session and a seeded campaign — infrastructure the
// Playwright harness here doesn't wire up (it boots with dummy public Firebase
// config and only exercises the unauthenticated surface; see
// playwright.config.ts and e2e/helpers.ts). Headless Chromium also exposes no
// system speechSynthesis voices, so real playback can't be asserted here. The
// deterministic piece (session-log dialogue parsing) is covered by
// lib/__tests__/voice.test.ts.
test.describe.skip('NPC Voice synthesis (needs auth + seed + system voices)', () => {
  test('assign a voice profile and play the preview', async ({ page }) => {
    const campaignId = 'seeded-campaign-id';
    await page.goto(`/campaign/${campaignId}`);

    // Open the NPC's card and its Voice section.
    await page.getByText('Inka').click();
    await page.selectOption('select[name="voiceId"]', { index: 0 });
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.locator('[data-voice-preview-played]')).toBeAttached({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Save Voice' }).click();
  });

  test('Scene Mode auto-plays voiced dialogue', async ({ page }) => {
    const campaignId = 'seeded-campaign-id';
    await page.goto(`/campaign/${campaignId}`);

    await page.getByRole('button', { name: 'Run' }).click();
    await page.getByRole('button', { name: 'Scene Mode' }).click();
    // …start a scene with Inka present, then send a turn…
    await page.fill('textarea[name="pcAction"]', 'I greet her.');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.locator('[data-voice-autoplay-fired]')).toBeAttached({ timeout: 30_000 });

    // Muting silences playback session-wide.
    await page.getByRole('button', { name: 'Voices' }).click();
    await expect(page.getByRole('button', { name: 'Muted' })).toBeVisible();
  });
});
