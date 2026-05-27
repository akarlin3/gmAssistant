import type { Page } from '@playwright/test';

// Authenticated-flow helpers for the Scene Mode E2E (Appendix H).
//
// These are intentionally unimplemented in this repo's Playwright setup, which
// boots the app with CI dummy Firebase config and only exercises the
// UNAUTHENTICATED surface (see playwright.config.ts). A real implementation
// needs the Firebase Auth + Firestore emulators plus a way to mint a Pro
// session and seed a campaign document — infrastructure that isn't wired up
// here. The Scene Mode happy-path test that depends on them is therefore
// marked `test.fixme` so the suite stays green until that harness exists.
//
// The pure Scene Mode logic (context builder, schema validation, fuzzy
// mentions, markdown export, roll resolution) is covered by the unit tests in
// lib/scene/__tests__ instead.

export type SeedCampaignOptions = {
  locations?: Array<{ id: string; name: string; description: string }>;
  npcs?: Array<{ id: string; name: string; traits: string; voice?: string }>;
  sessions?: Array<{ id: string; transcript: Array<{ text: string }> }>;
};

export type LoginAsProOptions = {
  usageOverride?: { assistant?: number };
};

export async function loginAsPro(_page: Page, _opts?: LoginAsProOptions): Promise<void> {
  throw new Error(
    'loginAsPro is not implemented: Scene Mode authenticated E2E requires the Firebase Auth/Firestore emulators.',
  );
}

export async function seedCampaign(
  _page: Page,
  _opts: SeedCampaignOptions,
): Promise<{ campaignId: string }> {
  throw new Error(
    'seedCampaign is not implemented: Scene Mode authenticated E2E requires the Firestore emulator.',
  );
}
