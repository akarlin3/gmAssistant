# Shared World Layer — Design

Date: 2026-05-23
Status: Approved, ready for implementation plan.

## 1. Goal

Let one TTRPG world be shared across multiple campaigns. A "world" owns static lore (factions, NPCs, locations, magic items, monsters, world facts, secrets pool, content lines, etc.). A "campaign" is a single play group's branch on that world: it owns PCs, PC goals, session logs, in-flight session run state, and per-campaign flags about which lore has been used/revealed/given to its party.

Concrete motivating case: Two campaigns named "Whispers of Lost Essence (Jake)" and "Whispers of Lost Essence (Generic)" are two variants of the same world. Edits to lore in one don't propagate to the other.

## 2. Mental Model

Git, not Notion. World = `main` (static lore). Campaign = long-lived branch (what happened to that lore at one table). Lore propagates world → campaign. Session state stays branch-local.

## 3. Decisions (locked in)

- **Strict inheritance** for V1. Each entity belongs to either the world or a campaign, never both. Reads concat. Defer the soft-overlay pattern (per-campaign overrides on shared entities) to V2 by reserving an `overrides` field that defaults to empty.
- **`worldId` is set at campaign-create time and is immutable** after that. No moving a campaign between worlds in V1.
- **No auto-migration of existing data.** Explicit "Convert this campaign to a shared world" button on the campaign editor that creates a new world from the campaign's current lore and points the campaign at it.
- **Plan-tab extract is a hard prerequisite.** The `CampaignEditor.tsx` Plan tab's Premise / World / Characters / Fronts sub-sections must be extracted into `components/plan/<Section>.tsx` files. The world editor will reuse these subcomponents.
- **Naming.** The existing Plan > **World** sub-tab (Session −1 collaborative worldbuilding) gets renamed to **Worldbuild** before any new "world" container concept is introduced.
- **Pro gating.** Worlds are not Pro-gated.

## 4. Data Model

### New Firestore collection `worlds/{worldId}`
```ts
type World = {
  id: string;
  userId: string;
  name: string;
  data: Record<string, any>;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};
```

### Update `Campaign` type
```ts
type Campaign = {
  id: string;
  userId: string;
  worldId?: string;
  name: string;
  data: Record<string, any>;
  done: Record<string, boolean>;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  playerIds?: string[];
  pendingPlayers?: { uid: string; email: string }[];
};
```

### Key Classification (`lib/worldData.ts`)
Single source of truth for which keys live where:
```ts
export const WORLD_KEYS = [
  'gWorld', 'gFNL', 'system', 'pitch', 'genre', 'tone', 'lines', 'facts', 'conflicts',
  'factions', 'secrets', 'npcs', 'locations', 'items', 'monsters',
  'homebrewMonsters', 'homebrewSpells', 'traps', 'treasure', 'handouts',
  'factionWorld', 'relationshipGraph', 'generatorLogs', 'vivifyHistory'
] as const;

export const CAMPAIGN_KEYS = [
  'characters', 'pcGoals', 'clocks', 'chases', 'downtime',
  'sessionLogs', 'sessionLogV2', 'scenes', 'campaignEventLog',
  'macros', 'spellFavs', 'logistics', 'strongStart',
  'endCatalyst', 'endReadiness', 'endThreads', 'dropped',
  'auditFactions', 'auditGoals', 'auditSecrets', 'reviewNotes',
  '__activeSessionId', '__sessionStartedAt', '__sessionEndedAt',
  '__sessionScratchpad', '__sessionUsedScenes', '__sessionItemsGiven',
  '__sessionChangeEvents', '__runSessionOpen', '__initiative', '__initiativeOpen',
  '__encounterCalc', '__prepWizardOpen', '__prepWizardStep', 'prepWizardRuns',
  '__archivedDowntimeOpen', 'revSec'
] as const;
```

## 5. Firestore Rules

```
match /worlds/{worldId} {
  allow read: if request.auth != null && (resource.data.userId == request.auth.uid);
  allow create: if request.auth != null && request.resource.data.userId == request.auth.uid && request.resource.data.id == worldId;
  allow update: if request.auth != null && resource.data.userId == request.auth.uid && request.resource.data.userId == resource.data.userId && request.resource.data.id == resource.data.id;
  allow delete: if request.auth != null && resource.data.userId == request.auth.uid;
}

match /campaigns/{campaignId} {
  // existing rules, plus:
  allow update: if /* existing checks */ && (request.resource.data.worldId == resource.data.worldId || resource.data.worldId == null);
}
```

## 6. Implementation Checkpoints

- **Checkpoint 0**: Rename Plan > World → Worldbuild.
- **Checkpoint 1**: Plan-tab extract to `components/plan/{Premise,Worldbuild,Characters,Fronts}.tsx`.
- **Checkpoint 2**: Schema, types, helpers (`lib/firebase/worlds.ts`, `lib/worldData.ts`).
- **Checkpoint 3**: Read-merge (`useCampaignAndWorld` hook).
- **Checkpoint 4**: Split writes (`setWorldVal` / `setCampaignVal`).
- **Checkpoint 5**: World editor surface (`app/world/[id]/page.tsx`).
- **Checkpoint 6**: World picker + convert flow.
- **Checkpoint 7**: Tests + docs update.

## 7. Out of scope (V2 deferrals)

- **Cross-user world sharing:** Publishing or co-ownership of worlds across different users is not supported in V1.
- **Per-campaign overrides:** A campaign overriding a world entity's details (e.g. "the mayor is dead in Jake's game, alive in Generic") is deferred. The data shape (`overrides: {}`) is reserved for this in V1 but no UI is built.
- **Moving a campaign between worlds:** The `worldId` is immutable once set. No explicit lore-migration UI to move between worlds in V1.
- **World forking / version snapshots:** No versioning or snapshots of world state.
- **World-level access controls:** Access controls separate from the owner's campaigns are deferred.
