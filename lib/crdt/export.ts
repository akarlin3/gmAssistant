/**
 * Read-only reconstruction of a campaign's current content from the CRDT log.
 *
 * After the offline-first CRDT migration, the live campaign content is owned
 * by a per-campaign Y.Doc and persisted through the `crdtSnapshots` +
 * `crdtUpdates` Firestore subcollections. The legacy `campaigns/{id}.data`
 * field is no longer written by the autosave loop, so any code that needs the
 * *current* data (Google Drive backups, campaign copy, etc.) must rebuild it
 * from the CRDT log rather than reading that stale field.
 *
 * This helper does a one-shot remote read (snapshot + trailing updates) and
 * folds it into a throwaway Y.Doc — no IndexedDB, no live subscription. When
 * the CRDT log is empty (a never-migrated campaign) it falls back to the
 * supplied legacy JSON so old campaigns still export correctly.
 */
import * as Y from 'yjs';
import { getLatestSnapshot, getUpdatesSince } from './firestore-transport';
import { getRoot, seedFromJson, yMapToJson } from './yjs-adapter';

export async function loadCampaignCrdtJson(
  campaignId: string,
  legacyData: Record<string, any> | null,
): Promise<Record<string, any>> {
  const doc = new Y.Doc();
  try {
    let throughClock = 0;
    const snapshot = await getLatestSnapshot(campaignId);
    if (snapshot && snapshot.state.length > 0) {
      Y.applyUpdate(doc, snapshot.state);
      throughClock = snapshot.throughClock;
    }
    const updates = await getUpdatesSince(campaignId, throughClock);
    for (const u of updates) {
      Y.applyUpdate(doc, u.update);
    }

    const root = getRoot(doc);
    // Never-migrated campaign: nothing in the CRDT log yet. Fall back to the
    // legacy `campaign.data` blob so the export isn't blank.
    if (root.size === 0 && legacyData && Object.keys(legacyData).length > 0) {
      seedFromJson(doc, legacyData);
    }
    return yMapToJson(getRoot(doc));
  } finally {
    doc.destroy();
  }
}
