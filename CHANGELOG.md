# Changelog

## Unreleased

### Added — Proven redaction invariant + authored PC write-back merge

The Player Mode redaction that makes public-read share docs safe is the
system's security boundary, and it is now **proven** rather than trusted, and
the player write-back path now resolves concurrent edits through authored,
domain-aware merge logic. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full
design.

- **Property-based proof of the redaction invariant** (`fast-check`, new dev
  dep). Reusable adversarial generators (`lib/playerMode/__tests__/arbitraries.ts`)
  feed the real projection across every Checkpoint-0 leak vector:
  - `lib/playerMode/__tests__/redaction.property.test.ts` — entities, fields,
    edges, session log, the PC-ownership bypass, the read-only graph consumer.
  - `lib/maps/__tests__/playerProjection.property.test.ts` — map layer/marker/
    edge visibility and GM-field stripping.
  - No leak found; the suite stands as a regression net (a future failure is a
    real privacy bug).
- **Authored field-authority merge for player write-backs**
  (`lib/crdt/writeback-merge.ts`). Yjs merges generic concurrent edits but
  can't decide *who* is authoritative or *whether a player may touch a PC*:
  - **Ownership guard** — a write-back staged at `pcWritebacks/{slot}` may only
    modify a PC owned by that slot. Closes a real authz gap (rules prove the
    slot is real but not that the targeted `pcId` belongs to it).
  - **Field-authority policy** — player-editable fields win on conflict; every
    other field is GM-authoritative and dropped (fail-closed).
  - **Deterministic concurrent resolution** — all pending write-backs merged in
    one pass (LWW by timestamp, tie-broken by slot id), fixing the reconciler's
    stale-snapshot lost-update race.
  - A property test reuses the redaction generators to prove merge +
    re-projection still upholds the visibility invariant.
- **`ARCHITECTURE.md`** — system design, rationale, tradeoffs, threat model,
  and a mermaid data/visibility flow diagram.

### Added — Offline-first CRDT sync for campaign data

Multi-device offline editing now converges without losing edits. Previously
Firestore's document-level last-write-wins meant a GM editing an NPC on
one device offline and a secret on another offline would silently lose one
set of edits on next sync. Campaign content now flows through a per-
campaign **Yjs CRDT**, persisted locally via `y-indexeddb` and transported
through Firestore as opaque binary updates with state-vector reconciliation
and snapshot-based GC.

- `lib/crdt/yjs-adapter.ts` — JSON ↔ Y.Doc conversion with id-keyed array
  merge.
- `lib/crdt/persistence.ts` — `y-indexeddb` integration; per-campaign DB
  namespace so it doesn't collide with Firestore's own local cache.
- `lib/crdt/firestore-transport.ts` — append-only `crdtUpdates/`
  subcollection + `crdtSnapshots/` for compaction.
- `lib/crdt/sync.ts` — orchestrator: IndexedDB hydration, remote
  reconciliation, live subscription, periodic snapshot + GC.
- `lib/crdt/use-crdt-campaign.ts` — React hook used by
  `useCampaignAndWorld`.
- Player Mode projections regenerate from the merged Y.Doc JSON view —
  reveal semantics (Private/Party/Custom), `@`-mention auto-reveal,
  sticky reveals, and the share-token capability all preserved.
- Firestore Rules updated for the new subcollections (owner-only, append-
  only, GC-permitted).

See [`docs/offline-sync.md`](docs/offline-sync.md) for the schema,
reconciliation algorithm, and trade-offs.
