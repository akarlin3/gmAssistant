# Player Mode — deferred items

Out of scope for the initial Player Mode build. Captured here so they don't get
lost. None of these block the shipped feature.

## Completed / Implemented

- **Character sheets owned/edited by players & Per-player notes writeback**: Implemented in Phase 5 of the campaign modes expansion. Under Duet/Standard modes, players are granted partial sheet ownership over their designated PC slot. Using a secure REST validation pipeline, they can update dynamic gameplay variables (HP, conditions, exhaustion, death saves) and maintain writeable goals, bonds, ideals, flaws, and freeform session notes from the player view. These writebacks bypass Admin SDK restrictions by staging inside a subcollection document, which is reconciled in real-time by the GM client's browser.

## Explicitly deferred by the spec
- Player-side dice rolling (rolling directly from player sheet and pushing to GM feed).
- Voice/video integration.
- Mobile native app.

## Surfaced during implementation
- **App Check on the public `/play` reads.** Players read `playerShares/**`
  directly (no API proxy), so there's no app-level rate limit today. Mitigated
  by unguessable 32-char tokens + Firestore quotas. App Check (or a thin read
  proxy) would harden against scraping.
- **True per-player secrecy** would require player accounts (anonymous Firebase
  Auth + a server that can set custom claims). Blocked today by the
  service-account-key org policy. Revisit if/when that policy changes.
- **Field-level visibility for string-array entities** (`items`, `monsters`,
  `treasure`) and for `spells`/`notes`. They have no per-instance fields/ids
  today; would need a schema change to objects with ids.
- **GM "active now / last update Xm ago" indicator** in the player view (from
  `playerLog`/projection `updatedAtMs`).
- **Background/offline projection refresh.** Projections only update while a GM
  client is connected. A Cloud Function writer would fix this but is blocked by
  the no-Functions/no-Admin-SDK constraint.
- **Mention chips linking to the entity** in the player view (currently rendered
  as plain labels).
- **Unifying with the existing `/invite` + `playerIds` flow.** Avery chose to
  keep both; the legacy `PlayerView` still filters client-side (a known soft
  spot) and could be migrated onto the projection model later.
