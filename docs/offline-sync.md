# Offline-First CRDT Sync

## Why

Firestore's offline persistence resolves conflicts at the whole-document
level. The campaign is a single deeply-nested document (`data.*` — NPCs,
factions, secrets, scenes, session log, vivify history, etc.). If a GM
edits an NPC on their phone while offline and a secret on their laptop
while offline, the second device to sync clobbers the first device's edits
silently — there is no merge, just a `last write wins` on the entire `data`
field.

The only writers to a campaign are the GM's own devices (players are
read-only in Player Mode), so this is the canonical single-user
multi-device offline editing problem. CRDTs solve it without any
user-facing conflict resolution UI: convergence is automatic and provably
deterministic.

## How

The system layers a **Yjs CRDT** on top of the existing Firestore
infrastructure. Firestore stays as the transport; the conflict model
changes.

```
       ┌──────────────────────────────────────────────────────┐
       │                  CampaignEditor (React)               │
       │  - debounced auto-save (1.5 s)                        │
       │  - applyCampaignData(state) ──► CRDT layer            │
       │  - syncs from merged Y.Doc JSON on remote updates     │
       └──────────────────────┬───────────────────────────────┘
                              │
       ┌──────────────────────▼───────────────────────────────┐
       │            CrdtSync   (lib/crdt/sync.ts)              │
       │  Y.Doc ────► observer.on('update', ...)               │
       │              │                                         │
       │  ┌───────────┴────────────┐                            │
       │  │                        │                            │
       │  ▼                        ▼                            │
       │ IndexedDB              Firestore                       │
       │ (y-indexeddb,           binary update log              │
       │  per-campaign DB)       + snapshot subcollection       │
       └───────────────────────────────────────────────────────┘
```

### Y.Doc schema

A single Y.Doc per campaign with root Y.Map (`data`). Top-level keys
mirror the existing JSON shape of `campaign.data`. Conversion rules:

| Source JSON                              | Yjs type        |
|------------------------------------------|-----------------|
| Object                                   | `Y.Map`         |
| Array                                    | `Y.Array`       |
| Array of `{id, ...}`                     | `Y.Array<Y.Map>` (merged by id) |
| Primitive                                | JS value        |

`applyJsonPatch(doc, newData)` reconciles a JSON snapshot against the
current Y.Doc, producing the minimum set of Yjs ops. Object keys diff by
key; arrays of objects with a stable `id` diff by id (so two devices
concurrently appending different entities both survive); arrays of
primitives diff positionally.

This deliberately does *not* use `Y.Text` for free-text fields. Whole-
string LWW per field is already a strict improvement over whole-document
LWW, and Y.Text would require touching every controlled-input call site.

### IndexedDB persistence

`y-indexeddb` persists the Y.Doc to `gmb-campaign-<id>` IndexedDB
databases — separate namespace from Firestore's own local cache so they
don't collide. Rehydration is synchronous-feeling: the editor mounts only
once `attachLocalPersistence().whenSynced` resolves.

### Firestore transport

Two subcollections per campaign:

| Path                                  | Purpose                                              |
|---------------------------------------|------------------------------------------------------|
| `campaigns/{id}/crdtUpdates/{auto}`   | Append-only binary updates: `{update, clientId, clock, createdAt}` |
| `campaigns/{id}/crdtSnapshots/{auto}` | Compacted full state + state vector + throughClock   |

Every Yjs transaction with non-`REMOTE_ORIGIN` origin fires
`doc.on('update', ...)`, which encodes the per-transaction binary delta
and writes it to the update log. Each write carries a clock value
(`highestKnownClock + localCounter`) — strict ordering matters only for
snapshot GC; ties are broken by Yjs's internal CRDT ordering, not the
clock.

### Reconciliation

On open:
1. Attach local persistence and wait for IndexedDB hydration.
2. `getLatestSnapshot(campaignId)` → `Y.applyUpdate` if found.
3. `getUpdatesSince(snapshot.throughClock)` → apply all in order.
4. If both local and remote are empty, seed from the legacy
   `campaigns/{id}.data` JSON (`seedFromJson`). The seed is then pushed
   back to Firestore as a single update so peers + future cold starts
   converge to it.
5. Subscribe to `crdtUpdates where clock > highestKnownClock` for live
   updates from peers.

When a peer's update arrives, `Y.applyUpdate(doc, update, REMOTE_ORIGIN)`
is called. The update handler skips remote-origin transactions when
shipping outbound, so updates never echo back.

### Snapshot + GC

Every `SNAPSHOT_EVERY_UPDATES` (50) writes or `SNAPSHOT_EVERY_MS` (5 min)
of activity, the orchestrator writes a new snapshot via
`writeSnapshotAndGc`:

1. Encode current Y.Doc state with `Y.encodeStateAsUpdate(doc)`.
2. Encode state vector with `Y.encodeStateVector(doc)`.
3. Write to `crdtSnapshots/{auto}` with `throughClock`.
4. Delete every `crdtUpdates` doc with `clock <= throughClock`.
5. Delete any older snapshots with `throughClock < throughClock`.

A device that has been offline long enough to miss pruned updates
rebuilds correctly from the latest snapshot (because the snapshot is the
full state at that point), then applies any newer updates from the log
on top.

### Projection regeneration

Player Mode projections (the public-read `playerShares/{token}/slots/{id}`
docs) are still computed by `publishProjections` in the GM browser. The
existing contentSignature effect in `CampaignEditor.tsx` watches local
React state; that state is now kept in sync with the merged Y.Doc JSON
view via the remote-merge effect. So when a peer's edits arrive, the Y.Doc
merges them, the JSON view updates, the editor's local state catches up,
contentSignature changes, and `publishProjections` re-fires from the
merged state. Private/Party/Custom reveal semantics, `@`-mention
auto-reveal, sticky reveals, and the share-token capability are all
preserved unchanged — the projection inputs are sourced from the same
merged campaign.data they always were.

### Firestore Rules

The new subcollections are append-only for the campaign owner and
unreadable to anyone else. Players never touch the binary update log; the
only player-visible surface remains the public-read `playerShares`
projections.

```firestore
match /campaigns/{campaignId}/crdtUpdates/{updateId} {
  allow read: if request.auth != null
    && get(/databases/$(database)/documents/campaigns/$(campaignId)).data.userId == request.auth.uid;
  allow create: if /* owner + schema check */;
  allow update: if false;
  allow delete: if /* owner only — used by GC */;
}
```

## Trade-offs

- **Whole-string LWW vs per-character merge.** Free-text fields (pitch,
  description, narration) are stored as plain strings, not `Y.Text`. Two
  devices editing the same string concurrently still LWW. Going to
  `Y.Text` is a larger refactor — every controlled input would need to
  bind to a `Y.Text` instead of plain state. Worth it if we ever expose
  collaborative typing; not worth it for the current single-GM-multi-
  device case.
- **Storage growth.** Each save writes a new `crdtUpdates` doc. The
  snapshot+GC loop bounds total log size to `SNAPSHOT_EVERY_UPDATES`
  pending updates plus the latest snapshot. At typical edit rates, total
  storage stays in the tens of KB.
- **Legacy `data` field.** The root campaign doc still carries the
  pre-CRDT `data` JSON for the lifetime of the migration. New writes no
  longer touch it — once a campaign has been opened post-migration, the
  Y.Doc is authoritative. The legacy field is kept as a one-way readable
  safety net.
- **Migration reversibility.** Migration is idempotent: it only seeds the
  Y.Doc when both local IndexedDB and remote Firestore logs are empty. A
  re-seed on a Y.Doc that already has state is a no-op, so opening an
  older client doesn't undo anything.

## Tests

- `lib/crdt/__tests__/yjs-adapter.test.ts` — schema round-trip,
  idempotency, id-keyed array merge, state-vector reconciliation,
  vivifyHistory 50-cap CRDT-aware trim.
- `lib/crdt/__tests__/sync.test.ts` — transport-level convergence
  (offline divergence then heal), snapshot+GC correctness, new-device
  cold-start hydration from the log.

## Deploying (security rules) — REQUIRED

⚠️ **The security rules are a separate deploy from the app.** The campaign
data path (NPCs, secrets, **session logs**, everything in `data.*`) now
writes through the `campaigns/{id}/crdtUpdates` and `crdtSnapshots`
subcollections. Those writes are only permitted by the rules in
`firestore.rules` (the `crdtUpdates` / `crdtSnapshots` `match` blocks).

Firebase **App Hosting auto-deploys the Next.js app on push to `main`, but
it does NOT deploy Firestore rules or indexes.** If you ship the app on top
of stale rules, every CRDT write fails with
`FirebaseError: Missing or insufficient permissions`, and the most visible
symptom is **ending a session** — the session-log write is rejected, so the
recap page reports the log as missing. (This actually happened in
production: the offline-sync app shipped before its rules were deployed.)

**Always deploy rules whenever `firestore.rules`, `firestore.indexes.json`,
or `storage.rules` change.**

- **Automated (preferred).** The `deploy-firestore-rules` job in
  `.github/workflows/ci.yml` deploys rules + indexes on push to `main`,
  after the rules emulator tests pass. It authenticates with a
  `firebase login:ci` user token (the org policy blocks service-account-key
  creation, so a token — not an SA key — is used). One-time setup:

  ```bash
  firebase login:ci   # prints a token; copy it
  ```

  Add it as the repo secret `FIREBASE_TOKEN` (Settings → Secrets and
  variables → Actions). Until the secret exists the job skips the deploy and
  stays green.

- **Manual.** From the repo root:

  ```bash
  npm run deploy:rules       # firestore + storage rules only
  npm run deploy:firestore   # rules + indexes + storage
  ```

The CRDT log query (`where('clock','>', x)` + `orderBy('clock')`) is a
single-field query that Firestore auto-indexes, so no composite index is
required today — but deploying indexes alongside rules keeps prod in sync if
that ever changes.
