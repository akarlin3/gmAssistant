# Player Mode — Checkpoint 0 Diagnostic Audit

**Status:** Audit only, no code changes. Read before Checkpoint 1.
**Bottom line:** The proposed architecture (per-entity Firestore collections +
Admin-SDK custom claims + Cloud Function shadow-collection writer) is
**incompatible with this codebase on three independent grounds**. A revised
architecture that fits the existing constraints is proposed in §5. **This needs
Avery's sign-off before any code is written.**

---

## 1. Entity inventory

The single biggest finding: **there are no per-entity Firestore collections.**
A campaign is **one Firestore document** `campaigns/{id}` with a freeform
`data: Record<string, any>` blob (`lib/firebase/campaigns.ts:10-22`). Every
"entity type" is just an array (or string) inside `data`. There are no
`npcs/{id}`, `locations/{id}` documents anywhere.

| `data.*` key | Shape | Stable `id`? | Player-safe vs secret |
|---|---|---|---|
| `characters[]` | Full PC sheet — abilities, ac/hp, attacks, spellcasting, backstory, notes (`lib/character-schema.ts:11-66`) | yes (`id`) | Currently **all** shown to players |
| `npcs[]` | name, type, faction, archetype, goal, method, appearance, abilities, talent, mannerism, interactions, knowledge, ideal, bond, flaw (`CampaignEditor.tsx:503-571`) | **no** (index fallback) | name/appearance safe; goal/method/knowledge/ideal/secrets GM-only |
| `locations[]` | name, type, aspects[3], factions (`CampaignEditor.tsx:573-602`) | **no** | name/type/aspects mostly safe |
| `sessionLogs[]` | **two shapes coexist** (see §6) | yes (`id`) | Currently **all** shown to players |
| `factions[]` | name, archetype, identity, area, power, ideology, shortGoals[], midGoals[], longGoal | **no** | mostly GM-only |
| `clocks[]` | text, faction, max, filled, notes | **no** | GM-only |
| `items[]` | **plain strings** ("Name · hook") | **n/a — strings** | reward prep, GM-only |
| `monsters[]` | **plain strings** ("Name · CR · use") | **n/a — strings** | GM-only |
| `treasure[]` | **plain strings** | **n/a — strings** | GM-only |
| `handouts` | single **string** (not an array) | n/a | shown to players |

**Consequences for the plan's schema:**
- The plan lists entities as **Item, Location, NPC, Faction, Monster, Spell,
  Note, Session**. Reality differs: there is **no `spells` entity type** and
  **no `notes` entity type** as campaign-level collections (PCs have a `spells`
  string field; there's an SRD spell reference in `lib/srd/spells.json`, but
  that's static reference data, not campaign content). `items`, `monsters`,
  `treasure` are **plain string arrays**, not objects — they have no fields to
  tag and no per-instance identity.
- Per-doc `visibility` / `fieldOverrides` fields **cannot be attached to
  entities** because entities aren't documents. They'd have to live as parallel
  arrays/maps inside `campaign.data` keyed by a synthesized entity id.
- `playerProjections/{slotId}/entities/{entityId}` assumes per-entity docs with
  stable ids. Half the entity types have **no id at all** (index-only).

## 2. Existing auth surface & existing sharing logic

- **`AuthProvider`** lives in `lib/firebase/auth-context.tsx`. Auth is
  **Google sign-in only** (`signInWithPopup`, `googleProvider`). No anonymous
  auth is wired in the client, and `firebase.json` shows `auth.providers: {}`
  (emulator). Anonymous provider status in the live project is **unknown — must
  be verified in the Firebase console** before relying on it.
- **Firestore rules** (`firestore.rules`): a campaign is readable by its
  `userId` (GM) **or** any uid in `playerIds`. Players are granted access via a
  request/approve flow (`pendingPlayers` → `playerIds`).
- **There is ALREADY a player feature**, and it's the thing this project
  supersedes:
  - `/invite/[id]` (`app/invite/[id]/page.tsx`): a signed-in Google user
    requests to join → GM approves → uid added to `playerIds`.
  - `components/PlayerView.tsx` renders a read-only view filtering
    `npcs.filter(n => n.isPublic)` and `locations.filter(l => l.isPublic)`, and
    shows **all** characters, **all** sessionLogs, and `handouts` unconditionally.
  - **Security hole worth flagging:** that filtering is **client-side only**.
    A player in `playerIds` can `read` the entire campaign doc — including every
    "private" NPC field — directly via the SDK. The current `isPublic` flag is
    UX, **not** a security boundary. The new design must redact server-side or
    in a separate published doc, never rely on client filtering.
  - Existing per-entity sharing flags: **only `isPublic` on npcs & locations**
    (`CampaignEditor.tsx:519,579`). Nothing else has a sharing flag.

## 3. Existing Cloud Functions / Admin SDK usage

- **Cloud Functions: none deployed.** `functions/src/index.ts` is empty
  boilerplate (just `setGlobalOptions`). There is **no projection-writer host**
  and no existing Functions CI/deploy path exercised.
- **Admin SDK: present but effectively unavailable for new features.**
  `lib/firebase/admin.ts` requires `FIREBASE_SERVICE_ACCOUNT_JSON`. It is
  imported **only** by the three Stripe routes, which `CLAUDE.md` documents as
  **dormant**. Critically, `CLAUDE.md` states the **org policy blocks
  service-account-key creation**, which is exactly why `verify-pro.ts` avoids
  the Admin SDK and verifies Firebase ID tokens with `jose` against Google's
  JWKS, and why the pro waitlist writes client-side under locked rules.
- **This kills the plan's auth mechanism.** Setting a Firebase **custom claim**
  (`campaignAccess`) *requires* the Admin SDK with a service-account key
  (`getAuth().setCustomUserClaims`). With key creation blocked, the
  anonymous-auth + custom-claim + rules-scoped-by-claim design is **not
  implementable in this deployment.** Likewise a Cloud Function projection
  writer would need admin credentials and a deploy path that doesn't exist.

The established, working pattern in this repo is: **client-side Web SDK writes
gated by locked Firestore rules, plus `jose` JWT verification server-side, no
Admin SDK.** The player-mode design should follow that pattern.

## 4. Read-path inventory

- GM route: `app/campaign/[id]/page.tsx` → `components/CampaignEditor.tsx`
  (a very large component). Navigation is a **mode/subview registry**
  (`lib/modes.ts`: `plan` / `prep` / `run` / `library`), state stored in
  `data.__mode` / `data.__subview`. Entities are edited inline via card
  components inside `CampaignEditor.tsx` (NPCCard ~503-571, LocationCard
  ~573-602, ClockCard ~706-750, ListField for string arrays ~300-355) and via
  dynamically-imported tab components (`SessionLogTab`, `NamesTab`, etc.).
- All entity data reaches the UI as **props derived from the single campaign
  doc** (`subscribeToCampaign` → `campaign.data.*`). There is no per-entity
  fetch to "swap" to a projection collection; the player view will instead read
  a **separate published doc** (see §5).
- Player read path today: `PlayerView.tsx` consumes the same `campaign.data`.

## 5. Schema decision — REVISED architecture (needs approval)

I'm pushing back hard here, per the plan's invitation to.

**Rejected (incompatible):** per-entity collections, per-entity `visibility`
docs, anonymous-auth custom claims, Cloud Function shadow-collection writer.

**Proposed (fits the codebase):** *GM-published projection docs, computed
client-side, read by unauthenticated players via an unguessable token in the
path.*

```
campaigns/{id}                      // unchanged single doc, GM-only
  + player: {
      shareToken: string            // random, unguessable; rotatable
      tokenVersion: number
      roster: [{ slotId, displayName, color? }]   // slotId = random
      fieldDefaults: { [entityType]: { [field]: 'public'|'private' } }
      // per-entity visibility lives here keyed by synthesized id, because
      // entities are array elements, not docs:
      entityVisibility: { [entityType]: { [entityId]: {
          mode: 'private'|'party'|'custom', allowedSlotIds?: string[],
          fieldOverrides?: { [field]: 'public'|'private' } } } }
    }

// PUBLIC, read-only-by-anyone, written ONLY by the owning GM client.
// Token in the path is the bearer capability (no player accounts).
playerShares/{shareToken}
  + meta: { campaignName, roster:[{slotId, displayName, color?}], tokenVersion }
playerShares/{shareToken}/slots/{slotId}
  + redacted payload for this slot (only visible entities + visible fields)
  + sessionLog: redacted entries
  // recomputed & written by the GM browser via resolveVisibility() on any
  // relevant change. Real-time onSnapshot on the player side is preserved.
```

Decisions, with justification:
- **Shadow collection vs API-proxy redaction → neither as specced; use
  GM-published projections.** A Cloud Function writer is impossible (no
  functions, no admin). A Next.js API proxy can't read the campaign doc either
  (no admin creds; campaign reads require the GM's own token). The GM's browser
  *already* holds full read access and an authenticated token, so it is the one
  place that can legitimately compute redactions — and writing them to a
  public-read doc keeps Firestore real-time listeners on the player side, which
  was the whole point of the shadow-collection preference. **Limitation:**
  projections only refresh while a GM client is connected. That's acceptable —
  reveals happen live during sessions when the GM is active — and is documented.
- **`fieldVisibilityDefaults` on the campaign doc**, not global config: defaults
  are per-campaign tunable (Checkpoint 2 ships an editor), so they must be
  per-campaign data.
- **Collapse `visibility.mode`:** keep the explicit `mode` enum
  (`private`/`party`/`custom`) — it reads clearly in the resolver and rules
  tests and avoids overloading one field with a union of string|array. Minor
  point; either works. I recommend keeping `mode`.
- **No anonymous auth, no custom claims.** Players are unauthenticated; the
  `shareToken` path segment is the capability. `/api/play/claim-slot` is **not
  needed** for auth (and can't set claims anyway). Slot selection is purely a
  client choice persisted to `localStorage`. We may keep a lightweight route
  only for rate-limited token *validation*, but it does no privileged writes.
- **Entity identity:** synthesize stable ids where missing. Object entities
  (npcs/locations/factions/clocks) get an `id` backfilled in the Checkpoint 1
  migration. **String-array entities (items/monsters/treasure) are out of scope
  for field-level visibility** — they're either fully shared or not shared as a
  block; recommend deferring them (they're GM prep notes, rarely player-facing).

## 6. Open questions for Avery (blockers before Checkpoint 1)

1. **Architecture pivot (blocking):** Approve the GM-published-projection design
   in §5 in place of the Admin-SDK/Cloud-Function design? Everything downstream
   depends on this.
2. **Anonymous auth:** With §5 we don't need it. Confirm we're OK with
   **fully-unauthenticated players** (capability = share-link token). If you
   want players to be Firebase-authenticated, that reintroduces the
   Admin-SDK-claims problem and we'd need a different plan.
3. **Per-player secrecy is best-effort without accounts.** Anyone with the link
   can technically read sibling slot docs (`playerShares/{token}/slots/*`) via
   the SDK. Per-player overrides protect against *accidental* viewing at the
   table, not a determined player inspecting traffic. True isolation requires
   player accounts (contradicts the "no player accounts" spec). Acceptable?
4. **Relationship to the existing `/invite` + `playerIds` feature:** This new
   token-based player mode overlaps with the existing Google-auth join flow and
   `PlayerView.tsx`. Replace the old flow, or run both? Recommend **replacing**
   `PlayerView.tsx`'s client-side filtering (it's a security hole) and keeping
   `/invite` only if you still want named co-GM-ish access. Needs your call.
5. **Pro gating (Checkpoint 5 asks, but affects scope):** Free or Pro? Plan's
   default is Free; I agree (retention driver). Confirm.
6. **`spells`/`notes` entity types in the spec don't exist** as campaign
   collections. Confirm we scope player mode to the entities that actually
   exist (characters, npcs, locations, factions, sessionLogs, handouts; +
   optionally clocks), and drop spells/notes/monsters/items from field-level
   tagging.
7. **Test infra:** `@firebase/rules-unit-testing` and a Firestore emulator
   harness are **not** installed (tests are vitest + node:test). Checkpoint 1's
   rules tests require adding that dependency + emulator wiring. OK to add?

---

### Non-blocking notes (defer-minimize)
- Two `sessionLogs` shapes coexist (legacy `{id,title,date,body}` vs modern
  `lib/sessionLog.ts` `{id,number,date,recap,events,...}`). The player feed must
  handle the legacy recap shape; modern entries carry GM-only `events`/`secrets`
  that must be stripped.
- `npcs`/`locations` lack stable ids today (index fallback) — backfill needed.
- `firestore.indexes.json` has no player-relevant indexes yet; none needed for
  the path-keyed `playerShares` design (direct doc reads, no queries).
