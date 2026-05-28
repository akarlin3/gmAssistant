// Firestore Security Rules tests for Player Mode, run against the emulator.
//
// Requires the Firestore emulator. Run via:  npm run test:rules
// (which boots `firebase emulators:exec`). Skipped automatically when the
// emulator host env var isn't present, so the normal vitest run isn't blocked.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';

const PROJECT_ID = 'player-mode-rules-test';
const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const d = hasEmulator ? describe : describe.skip;

let env: RulesTestEnvironment;

const GM_UID = 'gm-uid';
const OTHER_GM_UID = 'other-gm-uid';
const CAMPAIGN_ID = 'camp1';
const SHARE_TOKEN = 'share-token-abcdefghijklmnop';

d('Player Mode Firestore rules', () => {
  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    });
  });
  afterAll(async () => { if (env) await env.cleanup(); });

  beforeEach(async () => {
    await env.clearFirestore();
    // Seed a campaign owned by GM_UID with a player config + share token.
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'campaigns', CAMPAIGN_ID), {
        userId: GM_UID,
        name: 'Test Campaign',
        data: { player: { shareToken: SHARE_TOKEN, tokenVersion: 1 } },
        playerIds: [],
      });
      await setDoc(doc(db, 'playerShares', SHARE_TOKEN), {
        campaignId: CAMPAIGN_ID, campaignName: 'Test Campaign', tokenVersion: 1, roster: [],
      });
      await setDoc(doc(db, 'playerShares', SHARE_TOKEN, 'slots', 'slot-a'), {
        slotId: 'slot-a', entities: {}, sessionLog: [], updatedAtMs: 1,
      });
    });
  });

  it('GM can read their own campaign', async () => {
    const db = env.authenticatedContext(GM_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'campaigns', CAMPAIGN_ID)));
  });

  it('a different GM cannot read someone else’s campaign', async () => {
    const db = env.authenticatedContext(OTHER_GM_UID).firestore();
    await assertFails(getDoc(doc(db, 'campaigns', CAMPAIGN_ID)));
  });

  it('an unauthenticated player can read the share meta doc', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, 'playerShares', SHARE_TOKEN)));
  });

  it('an unauthenticated player can read a slot projection', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, 'playerShares', SHARE_TOKEN, 'slots', 'slot-a')));
  });

  it('a player cannot read the source campaign doc', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'campaigns', CAMPAIGN_ID)));
  });

  it('the owning GM can publish a slot projection', async () => {
    const db = env.authenticatedContext(GM_UID).firestore();
    await assertSucceeds(setDoc(doc(db, 'playerShares', SHARE_TOKEN, 'slots', 'slot-b'), {
      slotId: 'slot-b', entities: {}, sessionLog: [], updatedAtMs: 2,
    }));
  });

  it('a non-owner GM cannot publish to the share', async () => {
    const db = env.authenticatedContext(OTHER_GM_UID).firestore();
    await assertFails(setDoc(doc(db, 'playerShares', SHARE_TOKEN, 'slots', 'slot-b'), {
      slotId: 'slot-b', entities: {}, sessionLog: [], updatedAtMs: 2,
    }));
  });

  it('an unauthenticated client cannot write a slot projection', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, 'playerShares', SHARE_TOKEN, 'slots', 'slot-a'), {
      slotId: 'slot-a', entities: {}, sessionLog: [], updatedAtMs: 3,
    }));
  });

  it('the owning GM can create the share meta when the token matches', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      // remove the seeded meta so we test creation
      await setDoc(doc(ctx.firestore(), 'campaigns', 'camp2'), {
        userId: GM_UID, name: 'C2', data: { player: { shareToken: 'tok2', tokenVersion: 1 } }, playerIds: [],
      });
    });
    const db = env.authenticatedContext(GM_UID).firestore();
    await assertSucceeds(setDoc(doc(db, 'playerShares', 'tok2'), {
      campaignId: 'camp2', campaignName: 'C2', tokenVersion: 1, roster: [],
    }));
  });

  it('the owning GM can publish a meta doc under any token', async () => {
    const db = env.authenticatedContext(GM_UID).firestore();
    await assertSucceeds(setDoc(doc(db, 'playerShares', 'any-token'), {
      campaignId: CAMPAIGN_ID, campaignName: 'Test Campaign', tokenVersion: 1, roster: [],
    }));
  });

  it('owning GM can read their campaign’s pcWritebacks subcollection', async () => {
    const db = env.authenticatedContext(GM_UID).firestore();
    await assertSucceeds(getDocs(collection(db, 'campaigns', CAMPAIGN_ID, 'pcWritebacks')));
  });

  it('owning GM can write to their campaign’s pcWritebacks subcollection', async () => {
    const db = env.authenticatedContext(GM_UID).firestore();
    await assertSucceeds(setDoc(doc(db, 'campaigns', CAMPAIGN_ID, 'pcWritebacks', 'slot-1'), {
      pcId: 'pc-1', slotId: 'slot-1', updates: {}, updatedAt: 12345
    }));
  });

  it('non-owner GM cannot read pcWritebacks of someone else’s campaign', async () => {
    const db = env.authenticatedContext(OTHER_GM_UID).firestore();
    await assertFails(getDocs(collection(db, 'campaigns', CAMPAIGN_ID, 'pcWritebacks')));
  });

  it('unauthenticated client cannot read pcWritebacks', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(db, 'campaigns', CAMPAIGN_ID, 'pcWritebacks')));
  });

  it('unauthenticated player with valid share token can stage a writeback', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(setDoc(doc(db, 'campaigns', CAMPAIGN_ID, 'pcWritebacks', 'slot-a'), {
      shareToken: SHARE_TOKEN,
      pcId: 'pc-1',
      slotId: 'slot-a',
      updates: { 'hp.current': 12 },
      updatedAt: 12345,
    }));
  });

  it('unauthenticated player cannot stage a writeback without a share token', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, 'campaigns', CAMPAIGN_ID, 'pcWritebacks', 'slot-a'), {
      pcId: 'pc-1',
      slotId: 'slot-a',
      updates: { 'hp.current': 12 },
      updatedAt: 12345,
    }));
  });

  it('unauthenticated player cannot stage a writeback for an unregistered slot', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, 'campaigns', CAMPAIGN_ID, 'pcWritebacks', 'slot-ghost'), {
      shareToken: SHARE_TOKEN,
      pcId: 'pc-1',
      slotId: 'slot-ghost',
      updates: { 'hp.current': 12 },
      updatedAt: 12345,
    }));
  });

  it('unauthenticated player cannot stage a writeback with a non-allowlisted field', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, 'campaigns', CAMPAIGN_ID, 'pcWritebacks', 'slot-a'), {
      shareToken: SHARE_TOKEN,
      pcId: 'pc-1',
      slotId: 'slot-a',
      updates: { 'abilities.STR': 18 },
      updatedAt: 12345,
    }));
  });

  it('unauthenticated player cannot stage a writeback where path slotId differs from body slotId', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, 'campaigns', CAMPAIGN_ID, 'pcWritebacks', 'slot-a'), {
      shareToken: SHARE_TOKEN,
      pcId: 'pc-1',
      slotId: 'slot-other',
      updates: { 'hp.current': 12 },
      updatedAt: 12345,
    }));
  });

  it('unauthenticated player cannot delete a writeback', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'campaigns', CAMPAIGN_ID, 'pcWritebacks', 'slot-a'), {
        shareToken: SHARE_TOKEN, pcId: 'pc-1', slotId: 'slot-a', updates: {}, updatedAt: 1,
      });
    });
    const db = env.unauthenticatedContext().firestore();
    const { deleteDoc } = await import('firebase/firestore');
    await assertFails(deleteDoc(doc(db, 'campaigns', CAMPAIGN_ID, 'pcWritebacks', 'slot-a')));
  });
});
