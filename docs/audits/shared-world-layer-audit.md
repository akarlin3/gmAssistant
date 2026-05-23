# Shared World Layer — Audit

_Date: 2026-05-23_

Audit only. No code changes. Captures the existing campaign architecture, key taxonomy, and navigation surface for Checkpoint 2 of the Shared World Layer architecture.

---

## 1. Existing campaign architecture

### What exists

Every campaign is stored in the `campaigns/{id}` Firestore collection. The entire data payload of the campaign lives inside a single `data` object field:
```ts
type Campaign = {
  id: string;
  userId: string;
  name: string;
  data: Record<string, any>;     // all entities live here as keyed arrays
  done: Record<string, boolean>;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};
```
There are no subcollections. The `CampaignEditor.tsx` accesses all of this data via two unified methods: `get(key, fallback)` and `setVal(key, val)`. `setVal` merges the update into a local React state, which is debounced and synchronized to Firestore by `updateCampaign(id, { data })`.

### Shared abstractions

With the Shared World Layer, campaigns will now reference a parent `worlds/{worldId}`. A world object has the same underlying shape as a campaign but lacks campaign-specific lifecycle properties. Reading a campaign will merge `campaign.data` and `world.data`.

---

## 2. Exhaustive Taxonomy of `data.*` Keys

We analyzed `components/CampaignEditor.tsx` and all `lib/*` files to extract all keys read or written via `get()` and `setVal()`. Below is the exhaustive categorization assigning keys to the World layer versus the Campaign layer.

### World-Scoped Keys (Static Lore)

These keys define the setting, characters, places, and rules of the shared world. They belong to `world.data`.

| Key | Description / Type |
|---|---|
| `gWorld` | Array of world facts (string) |
| `gFNL` | Array of FNL (Factions, NPCs, Locations) required entities (string) |
| `system` | RPG system used (e.g., "5e") |
| `pitch` | 2-3 sentence pitch for the world |
| `genre` | One-sentence genre description |
| `tone` | Array of tone words |
| `lines` | Array of content lines / topics to avoid |
| `facts` | Array of world facts |
| `conflicts` | Array of active conflicts |
| `factions` | Structured array of factions |
| `secrets` | Array of secrets and clues |
| `npcs` | Structured array of NPCs |
| `locations` | Structured array of locations |
| `items` | Array of items / magic items |
| `monsters` | Array of monster concepts |
| `homebrewMonsters` | Array of custom monsters |
| `homebrewSpells` | Array of custom spells |
| `traps` | Array of traps/hazards |
| `treasure` | Array of treasure items |
| `handouts` | Free-text handouts/notes |
| `factionWorld` | World-level faction notes |
| `relationshipGraph` | NPC/Faction relationships |
| `generatorLogs` | Historical generated items |
| `vivifyHistory` | AI-generated prose history |

### Campaign-Scoped Keys (Play State)

These keys define the specific progression, player characters, clocks, and live session state of a single playgroup. They belong to `campaign.data`.

| Key | Description / Type |
|---|---|
| `characters` | Player characters in this campaign |
| `pcGoals` | Active PC goals |
| `clocks` | Active faction clocks (campaign-specific progress) |
| `chases` | Chase mechanics and progress |
| `downtime` | Downtime activities and renown |
| `sessionLogs` | Historical session logs |
| `sessionLogV2` | New session log structure |
| `scenes` | Potential scenes |
| `campaignEventLog` | Event log specific to this campaign |
| `macros` | Saved dice macros |
| `spellFavs` | Favorited spells |
| `logistics` | Real-world scheduling/logistics |
| `strongStart` | Strong start prompt for the next session |
| `endCatalyst` | End of session catalyst |
| `endReadiness` | End of session readiness |
| `endThreads` | End of session threads |
| `dropped` | Dropped threads/elements |
| `auditFactions` | Faction audit notes |
| `auditGoals` | Goals audit notes |
| `auditSecrets` | Secrets audit notes |
| `reviewNotes` | Review notes for campaign |
| `revSec` | Revealed secret IDs (`revealedSecretIds`) |
| `__sessionChangeEvents` | Live session change events |
| `__activeSessionId` | ID of the current running session |
| `__sessionStartedAt` | Start timestamp of current session |
| `__sessionEndedAt` | End timestamp of current session |
| `__sessionScratchpad` | Ephemeral scratchpad for the session |
| `__sessionUsedScenes` | Used scenes flags |
| `__sessionItemsGiven` | Given items flags |
| `__runSessionOpen` | Boolean flag if a session is currently running |
| `__initiative` | Live initiative order |
| `__initiativeOpen` | Boolean flag if initiative tracker is open |
| `__encounterCalc` | Ephemeral encounter calculator state |
| `__prepWizardOpen` | Boolean flag if prep wizard is open |
| `__prepWizardStep` | Current prep wizard step |
| `prepWizardRuns` | History of prep wizard runs |
| `__archivedDowntimeOpen` | Boolean flag if archived downtime is open |

### Gap Analysis & ID Stability

1. **ID Stability Requirement**: Every entity in `npcs`, `locations`, `items`, `monsters`, `secrets`, `scenes`, and `factions` must have a stable `id` to allow the campaign to reference them in arrays like `revealedSecretIds` (`revSec`) or `usedSceneIds`. This requires backfilling missing IDs using `crypto.randomUUID()` on first load.
2. **Action Flags Migration**: "Mark Revealed", "Mark Used", and "Mark Given" actions currently mutate the entity directly. This must change to toggle IDs in campaign arrays (`revSec`, `__sessionUsedScenes`, `__sessionItemsGiven`).

## 3. Behavior Changes

- **Reads**: `useCampaignAndWorld(campaignId)` will fetch both the `campaign` document and its associated `world` document, returning a unified `merged` object.
- **Writes**: `setVal(key, value)` will be entirely replaced by `setWorldVal` and `setCampaignVal`. The underlying UI components will need to know whether they are modifying a world key or a campaign key.
- **Idempotency**: Converting a single standalone campaign to a shared world will automatically create the `world` document and set the `worldId` on the `campaign` document. Operations to extract existing lore keys from `campaign.data` into `world.data` will happen safely via batched writes. Existing users with only one campaign will not notice any difference.
