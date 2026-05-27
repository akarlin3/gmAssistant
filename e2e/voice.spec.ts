import { test, expect } from '@playwright/test';

// NPC Voice synthesis (TTS) — happy-path E2E (Appendix F), written against the
// real UI selectors built for this feature:
//   - NPC card → "Voice" section → select[name="provider"], select[name="voiceId"],
//     speed/stability sliders, "Preview" / "Save Voice", [data-voice-preview-played]
//   - Scene Mode → turn dialogue auto-plays ([data-voice-autoplay-fired]),
//     header "Voices"/"Muted" toggle + "Skip"
//   - /api/voice/speak returns 429 with a "Monthly TTS limit reached" message
//     once the monthly character quota is exhausted
//
// SKIPPED: like the Scene Mode and Living World suites, these steps require an
// authenticated Pro session, a seeded campaign, and (for real audio) the OpenAI
// TTS key — infrastructure the Playwright harness here doesn't wire up (it boots
// with dummy public Firebase config and only exercises the unauthenticated
// surface; see playwright.config.ts and e2e/helpers.ts). The deterministic
// pieces (dialogue parsing, cache-key signature, quota dates) are covered by
// lib/__tests__/voice.test.ts.
test.describe.skip('NPC Voice synthesis (needs auth + seed + TTS key)', () => {
  test('assign a voice profile and play the preview', async ({ page }) => {
    const campaignId = 'seeded-campaign-id';
    await page.goto(`/campaign/${campaignId}`);

    // Open the NPC's card and its Voice section.
    await page.getByText('Inka').click();
    await page.selectOption('select[name="provider"]', 'openai');
    await page.selectOption('select[name="voiceId"]', 'nova');
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

  test('quota is enforced with a reset date', async ({ page }) => {
    // With usage already at the monthly limit, the preview call returns 429.
    const campaignId = 'seeded-campaign-id';
    await page.goto(`/campaign/${campaignId}`);
    await page.getByText('Inka').click();
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByText(/Monthly TTS limit reached/i)).toBeVisible();
  });
});
