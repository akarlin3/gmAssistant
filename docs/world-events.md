# Procedural World Events — propose-only engine (CP3 + CP4)

A state-propagation + faction-heuristics engine that **only proposes** changes
to the campaign world, plus the review/commit UI that lands approved proposals
through the normal CRDT/auto-save path.

## The non-negotiable invariant

Nothing in this feature mutates canonical `data.*` directly. Both trigger paths
write `PendingWorldEvent`s to a queue; canonical edges change **only** in
`applyApprovedDeltas`, and only for proposals the GM has approved (or that a
per-rule `autoApply` toggle has opted in). The commit is written through the
existing `setVal → CRDT/auto-save` path — the single consistent writer that
regenerates player projections.

## CHECKPOINT 0 findings (what the codebase actually is)

1. **Canonical commit path.** `applyCampaignData(json)` →
   `CrdtSync.applyJson` → `applyJsonPatch` on the campaign Y.Doc. In practice
   the wrapper is `saveToDB` (`useSyncAndSave.ts`), which splits a patch:
   `WORLD_KEYS` go to the World doc, everything else (including
   `relationships`) goes through the CRDT. The editor's `setVal` feeds this
   debounced save, so writing `relationships` via `setVal` is the canonical
   write. Player projections regenerate **client-side** via
   `publishProjections` / `useAutoPublish` — *not* a Cloud Function.

2. **A reactive Cloud Function is not viable here** (three independent grounds,
   mirroring `docs/player-mode-audit.md §3`):
   - No CF host exists (`functions/src/index.ts` is empty boilerplate; org
     policy blocks service-account keys, so the Admin SDK is unavailable).
   - Campaign `data.*` is **not** a readable doc — it is binary Yjs updates in
     `campaigns/{id}/crdtUpdates/*`. A CF would see opaque blobs, not a
     `status: alive → dead` field delta.
   - A CF writing `data.*` would race the Yjs merge — the forbidden invariant.

   → Per CP0 sign-off, the reactive trigger is a **client-side observer**
   (`useReactiveWorldEvents`) in the GM session.

3. **Queue storage.** Per CP0 sign-off the queue lives in the CRDT at
   `data.pendingWorldEvents` (offline-first, merges across devices, no second
   writer, no new security rule) rather than a Firestore subcollection.

## Modules

| File | Role |
| --- | --- |
| `lib/world/propagation.ts` | Pure math: `propagate()`, `signForKind()`, `driftWeight()`. |
| `lib/world/proposals.ts` | Queue types/helpers, proposal builders, `applyApprovedDeltas` (the only canonical writer). |
| `lib/world/batch.ts` | "Advance World" DM batch: drift + faction conflicts + propagation. |
| `lib/world/reactive.ts` | Pure death-transition detection. |
| `lib/world/useReactiveWorldEvents.ts` | Client observer (propose-only). |
| `components/world/WorldEventsReview.tsx` | Review/commit UI + per-rule autoApply (mounted in `LivingWorldTab`). |

## Propagation math

For an anchor change Δ rippling to neighbor M across edge `e` at hop `k`:

```
ΔM = Δ · weight(e) · sign(kind) · decay^k      // ally +, hostile −, dependent proportional
```

Implemented as a multiplicative cascade (each hop multiplies the running
magnitude by `weight·sign·decay`). **Convergence/recursion-safety is
structural:** every weight ∈ [0,1], |sign| = 1, decay ∈ (0,1), so magnitude
strictly shrinks along every path; expansion stops when `|ΔM| < ε` or
`hop > depthCap`, and a visited-set guarantees each node is expanded at most
once even through cycles. There is no edge configuration that loops forever
(see `__tests__/propagation.test.ts`: triangle-cycle and 30-node dense-graph
stress tests).

Weight drift toward a kind baseline over elapsed sessions:

```
weight_new = baseline + (weight_old − baseline) · decayRate^sessionsElapsed
```

## Triggers (both propose-only)

- **DM batch — "Advance World"** (`runBatchProposals`): weight drift + faction
  conflict heuristics (`wealth(A) > wealth(B) AND hostility > 0.8 → escalate`) +
  propagation from each conflict aggressor. Wealth uses an explicit faction
  field if present, else a graph proxy (summed holding-edge weight).
- **Reactive observer** (`useReactiveWorldEvents`): watches NPC death
  transitions in the merged Y.Doc JSON and enqueues a bounded propagation. The
  only field it ever writes is `data.pendingWorldEvents` — verified
  propose-only.

## Commit

Approving a proposal runs `applyApprovedDeltas` (today: `field === 'weight'` on
the matched edge, clamped to 0..1) and writes the result via
`setVal('relationships', …)`. That flows through the CRDT and regenerates player
projections. Rejecting drops the event from the queue with no canonical write.

## Interactive graph editing (CP5)

The campaign graph is now a **write surface**, and every write goes through the
same CRDT/auto-save path as the rest of the editor — no second writer, no
projection bypass.

- **Edge editing** (`components/wiki/WikiTab.tsx`). Drag from one node's connect
  dot to another opens a create-edge picker (kind/weight/visibility); clicking an
  edge opens an in-place editor (kind/weight/visibility/delete). All route
  through new `WikiContext` methods `createEdge` / `updateRelationship` /
  `removeRelationship`, whose pure array transforms live in
  `lib/wiki/relationships.ts` (`createEdge`, `updateRelationship`). Because they
  call `setState`, edits ride the CRDT and converge across offline devices.
- **Node-state editing.** The graph sidebar's `NodeStateEditor` toggles an NPC's
  `dead` flag via `WikiContext.updateEntityState` — the same `setState` path the
  rest of the editor uses (not a fork). That canonical death transition is then
  picked up by the reactive observer and lands as a **propagation proposal**, not
  a silent edge mutation — preserving the non-negotiable invariant above.
- **Loop safety.** Graph-originated edits feed the CP3 engine only through the
  guarded `propagate()` (visited-set + ε + depthCap). An adversarial A→B→C→A
  high-weight cycle terminates with ≤1 bounded delta per edge
  (`lib/world/__tests__/proposals.test.ts`).
- **Player mode stays read-only.** `GraphCanvas` is editable only when passed
  `editable` (GM `WikiTab`); the player `ConnectionsTab` never passes it, so
  handles are inert and `nodesConnectable` is false. A `private` edge created
  here is absent from player projections (`projectEdges` is fail-closed;
  `lib/playerMode/__tests__/projection.test.ts`).
- **Perf.** Layout recomputes only on a *topology* signature (node/edge set +
  clustering) — edge **weight** is deliberately excluded, so tuning a weight
  updates only stroke width without re-settling the force layout. Combined with
  React Flow's `onlyRenderVisibleElements`, drag/connect stays responsive at
  100+ nodes.
