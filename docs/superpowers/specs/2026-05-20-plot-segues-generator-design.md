# Plot Segues Generator — Design

Date: 2026-05-20
Status: Approved, ready for implementation plan.

## 1. Goal

Add a new generator to the Generators tab — **Plot Segues** — that produces 1–5 short narrative segues per click, fully AI-generated. Three flavors selected via input: **bridge** (transition between scenes), **complication** (mid-scene twist), **cliffhanger** (session-ender). The generator is Pro-only: there is no deterministic fallback, no curated table. Every click hits Claude.

This is the first generator in the suite that has no client-side deterministic step. All existing generators (treasure-hoard, trinket, mundane-shop, magic-shop, tavern, tavern-name, dungeon, settlement) compose `GeneratorPanel`'s synchronous `generate(inputs, rng) => result` with an optional Pro-gated `enhance` on top. Plot Segues breaks that shape: the Generate button itself must be Pro-gated and async.

## 2. Approach

Build a new sibling component `AIGeneratorPanel` rather than refactoring the existing `GeneratorPanel`. Same shell (inputs grid, result card, save-to-log, AddToCampaignPicker, GeneratorLog below); but:

- The primary action button is `<LockedInline label="Generate (Pro)" />` for non-Pro users; for Pro users it is an async **Generate** that calls the server endpoint.
- No `rng`/`seed` plumbing — seeds don't apply to a stateless AI call.
- No separate Enhance button — generation *is* the AI step.
- The "Use campaign context" checkbox is dropped; campaign context is always sent when present (per requirements).

`GeneratorPanel` stays untouched. The two panels share no code beyond imports — the surface area is small enough that duplication is preferable to coupling.

## 3. Module layout

New files:
- `lib/generators/plot-segue.ts` — `PlotSegueResult` type, `PlotSegueInputs` type, and a client-side `generatePlotSegues(inputs, idToken, campaignContext?)` helper that POSTs to the endpoint and returns the typed result.
- `app/api/generators/plot-segue/route.ts` — Pro-gated AI endpoint. Mirrors `/api/generators/enhance/route.ts` structurally: `readBearerToken` → `verifyPro` → instantiate `Anthropic` client → call into a per-kind prompt module. Uses `claude-haiku-4-5-20251001`, `maxDuration: 30`, `runtime: 'nodejs'`.
- `lib/generators/plot-segue-prompt.ts` — server-only system prompt + JSON schema + `callPlotSegue(client, inputs, ctx)`. Kept separate from `enhance.ts` because this is generation, not enhancement.
- `components/generators/AIGeneratorPanel.tsx` — the new shell. ~150 lines.
- `components/generators/PlotSegueGenerator.tsx` — thin wrapper that declares inputs, calls `generatePlotSegues`, and renders the result.
- `lib/generators/__tests__/plot-segue.test.ts` — unit tests for `mapItem`, `itemsFor`, and the addToCampaign config for the new dest.

Modified files:
- `lib/generators/types.ts` — add `PlotSegueResult` to the `GeneratorResult` union (and therefore `GeneratorKind`).
- `lib/generators/log.ts` — add `'plot-segue'` to `LogKind`.
- `lib/generators/addToCampaign.ts` — add `'plot-segue'` to `CONFIG`; add `'session-log'` to `CampaignDestKey` + `DEST_LABEL`; extend `mapItem` for `scenes`/`secrets`/`facts`/`session-log` cases handling segue payloads; extend `buildPatch` so `dest === 'session-log'` writes to the `__sessionChangeEvents` array (see §7).
- `components/generators/GeneratorsTab.tsx` — add a **Story** group at the top with one entry: `{ slug: 'plot-segue', label: 'Plot Segues', icon: Drama }`.
- `components/CampaignEditor.tsx` — `addToCampaignFor` already passes `current = state[dest]`. We extend it: when `dest === 'session-log'`, source `current` from `state['__sessionChangeEvents']` and target the same key in the resulting patch. Also: if `!state.__runSessionOpen`, the Session Log option must be unavailable in the picker (handled in the picker itself, see §7).

## 4. Inputs

Declared on the panel via the same `InputSpec` array shape used by `GeneratorPanel`:

| Key            | Kind   | Default      | Range / Options                                  |
|----------------|--------|--------------|--------------------------------------------------|
| `segueType`    | select | `bridge`     | `bridge` \| `complication` \| `cliffhanger`      |
| `count`        | number | `3`          | 1–5                                              |
| `tone`         | select | `escalating` | `gentle` \| `escalating` \| `dire`               |
| `currentScene` | text   | `''`         | optional, placeholder `"The party is..."`        |

## 5. Output shape

```ts
export type PlotSegueResult = {
  kind: 'plot-segue';
  id: GenericId;
  inputs: {
    segueType: 'bridge' | 'complication' | 'cliffhanger';
    count: number;
    tone: 'gentle' | 'escalating' | 'dire';
    currentScene: string;
  };
  segues: PlotSegue[];
  enhanced: true; // always — this is pure AI
};

export type PlotSegue = {
  title: string;     // 3–6 words, e.g. "A Knock at Midnight"
  readAloud: string; // 1–3 sentences the DM can read at the table
  gmNote?: string;   // optional one-line mechanics cue
};
```

Note: `enhanced: true` is set unconditionally so the `GeneratorResult` discriminant union stays consistent with the other result types (which use `enhanced: boolean`). The field carries no meaning here; pure-AI generators are always "enhanced".

`seed: number` is **omitted** from `PlotSegueResult` (every other result type has it). This is the first non-seeded result. The discriminant union does not require `seed` — TypeScript will narrow correctly. Confirmed safe by reading `types.ts:330-338`.

## 6. Server prompt

System prompt (single string, with `cache_control: 'ephemeral'` to share across requests):

```
You generate "plot segues" for a TTRPG game master mid-session. A segue is
one of three things, depending on segueType:
  - bridge: a 1–3 sentence narrative transition that moves the table from
    one scene to another (travel, time-skip, scene-cut).
  - complication: a 1–3 sentence interruption that twists the current
    scene without resolving it (a stranger arrives, weather turns,
    something the party assumed is wrong).
  - cliffhanger: a 1–3 sentence beat that ends the session on tension
    and primes the next one.

Tone shapes pacing:
  - gentle: slow the table down, breathe, create space.
  - escalating: nudge tension upward, hint at consequence.
  - dire: name a present threat, raise stakes immediately.

You receive: { segueType, count, tone, currentScene?, campaignContext? }.
Generate exactly `count` segues. Each one:
  - title: 3–6 words, evocative, no punctuation at the end.
  - readAloud: 1–3 sentences (≤45 words), second-person plural, in the
    register of an at-the-table read-aloud.
  - gmNote: optional, ≤18 words, a mechanics or pacing cue (e.g.
    "calls for a Wisdom (Insight) check", "burn this if the party stalls").

If currentScene is provided, bridge from it; otherwise write segues that
stand alone. Lean into campaignContext (genre, tone, pitch, world facts,
setting facts) when present — but never invent named NPCs, factions, or
locations the campaign does not already mention.
```

JSON schema constrains output to `{ segues: [{ title, readAloud, gmNote? }] }`. Response parsed via `output_config.format.json_schema` — same call shape as `enhance.ts:callJson`.

`MAX_TOKENS: 1200`. `MODEL: 'claude-haiku-4-5-20251001'`.

## 7. Add to Campaign — four destinations

User selects one of four destinations per save:

| Dest key      | Label              | Backing data field             | Mapping                                              |
|---------------|--------------------|--------------------------------|------------------------------------------------------|
| `scenes`      | Potential Scenes   | `state.scenes: string[]`       | `"<title> — <readAloud>"`                            |
| `secrets`     | Secrets & Clues    | `state.secrets: string[]`      | `"<title> — <readAloud>"`                            |
| `facts`       | Setting Facts      | `state.facts: string[]`        | `"<title> — <readAloud>"`                            |
| `session-log` | Session Log (live) | `state.__sessionChangeEvents`  | `makeEvent('other', "Segue: <title> — <readAloud>")` |

`scenes` is the default destination. Each segue in the result is one selectable in `AddToCampaignPicker` (label = the segue title).

### 7a. Wiring `session-log` as a destination

`session-log` is a virtual dest — it does not map to `state['session-log']`. Two changes make it work without polluting other generators:

1. **`addToCampaign.ts`** — add the dest key + label. `mapItem(kind, 'session-log', item)` returns a `ChangeEvent` object (via `makeEvent`). `buildPatch` reads `current` as-is (caller passes the right array) and appends.
2. **`CampaignEditor.tsx::addToCampaignFor`** — when `dest === 'session-log'`, the helper sources `current` from `state.__sessionChangeEvents` (not `state['session-log']`) and writes the patch back to the `__sessionChangeEvents` key. The `trackEvent('other', …)` call is **skipped** for this dest to avoid double-logging.

Other generators do not gain a `session-log` option because each generator's `CONFIG[kind].allowed` controls the dropdown — only `plot-segue`'s config will list `'session-log'`.

### 7b. Gating when no session is open

If `!state.__runSessionOpen`, the `session-log` option is rendered in the dropdown but disabled, with title text `"Start a Run Session to enable this"`. The picker reads a new optional prop `disabledDests?: CampaignDestKey[]` and renders disabled `<option>` tags for entries in that set. `CampaignEditor` passes `disabledDests={state.__runSessionOpen ? [] : ['session-log']}` down through `GeneratorsTab → AIGeneratorPanel`.

### 7c. Live-result vs log-row Add-to-Campaign

The picker already appears in two places (under the live result inside the panel, and under each saved log row inside `GeneratorLog`). Both paths flow through `addToCampaignFor`, so the same `disabledDests` gating applies in both.

## 8. Campaign context

Always sent when present (no checkbox). The `AIGeneratorPanel` accepts the same `campaignContext?: CampaignContext` prop as `GeneratorPanel`; if `hasCampaignContext(campaignContext)` is true, it is included in the POST body. The server prompt's campaign-context guidance is built in (see §6) — we do not need the separate `CAMPAIGN_GUIDANCE` suffix used in `enhance.ts`.

## 9. Errors

`AIGeneratorPanel` renders endpoint errors the same way `GeneratorPanel` does today: a single `<p className="text-xs text-crimson italic">` under the input row. The endpoint maps Anthropic API failures to `502` with the upstream message (matches `enhance/route.ts`), missing/invalid bodies to `400`, missing token to `401`, non-Pro to `403`. The client surfaces `body.error` when present.

No retries. No streaming. A single 30s call.

## 10. Testing

- **Unit (`lib/generators/__tests__/plot-segue.test.ts`)** — `itemsFor('plot-segue', payload)` returns one item per segue; `mapItem` correctly shapes a string for `scenes`/`secrets`/`facts` and a `ChangeEvent` for `session-log`; `allowedDestsFor('plot-segue')` returns all four; `defaultDestFor('plot-segue')` returns `'scenes'`.
- **Server route** — light integration: missing token → 401, non-Pro → 403 (mock `verifyPro`), missing `inputs` → 400, happy path round-trips a mocked Anthropic client and returns the parsed shape.
- **No UI snapshot tests** — matches existing generator conventions.

## 11. Out of scope

- Re-rolling a single segue from a 5-item result. (Would require per-item AI calls; we ship the v1 as "reroll regenerates the whole batch".)
- Streaming partial results.
- Per-user generation history beyond the existing per-generator log cap.
- Sharing/exporting segues outside the campaign.

## 12. Open questions resolved during brainstorm

| Question | Decision |
|---|---|
| What is a plot segue? | All three types (bridge / complication / cliffhanger), picked via input. |
| Where in UI? | New "Story" group in the Generators tab sidebar. |
| Panel approach? | New `AIGeneratorPanel` (option A). |
| Inputs? | segueType, count (1–5), tone slider, free-text current scene. |
| Campaign context? | Always on when present, no checkbox. |
| Add-to-Campaign destinations? | All four: Potential Scenes (default), Secrets & Clues, Setting Facts, live Session Log. |
