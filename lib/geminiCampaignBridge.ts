// Zero-Key 2-Step Gemini Bridge & "Previously On..." Recap Compiler.
//
// Works 100% client-side with zero API keys required:
//   Step 1: Generates a context-aware prompt with a strict TypeScript/JSON
//           output schema for Google Gemini (`https://gemini.google.com/app`).
//   Step 2: Strips markdown code fences from pasted Gemini output, validates
//           the JSON payload with Zod, computes a diff preview, saves a
//           pre-apply snapshot to the 7-Snapshot Rolling Safety Vault, and
//           merges entities/recaps cleanly into campaign state / Yjs.

import { z } from 'zod';
import { captureVaultSnapshot, makeSnapshotId, summarizeCampaignState, type VaultSnapshot } from './snapshotVault';
import { makeLogEntryId, type PlayerLogEntry } from './playerMode/sessionLog';
import type { SlotProjection } from './playerMode/types';
import type { PlayerTrackerState } from './playerMode/playerTrackerStorage';

export const GEMINI_WEB_APP_URL = 'https://gemini.google.com/app';

export type GeminiBridgePreset =
  | 'session_recap'
  | 'structured_entities'
  | 'player_journal_summary';

export type GeminiBridgePresetId = GeminiBridgePreset;

export const GEMINI_BRIDGE_PRESETS: ReadonlyArray<{
  id: GeminiBridgePreset;
  label: string;
  shortLabel: string;
  description: string;
  playerAllowed: boolean;
  playerSafe: boolean;
}> = [
  {
    id: 'session_recap',
    label: 'Compile "Previously On..." Session Recap',
    shortLabel: '"Previously On..." Recap',
    description:
      'Serializes recent revealed Session Log entries, active Quests, and visited Locations/NPCs into a dramatic TV-style recap.',
    playerAllowed: false,
    playerSafe: false,
  },
  {
    id: 'structured_entities',
    label: 'Generate Structured NPCs / Monsters / Magic Items / Secrets',
    shortLabel: 'Generate Entities & Secrets',
    description:
      'Serializes campaign tone, world facts, and active party level to generate drop-in NPCs, locations, monsters, magic items, and secrets.',
    playerAllowed: false,
    playerSafe: false,
  },
  {
    id: 'player_journal_summary',
    label: 'Player Journal Summary',
    shortLabel: 'Player Journal Summary',
    description:
      'Uses only player-visible lore and your local player tracker notes to synthesize a first-person adventurer journal entry and quest checklist.',
    playerAllowed: true,
    playerSafe: true,
  },
];

// ---- Zod Schemas for Validating Returned Gemini JSON -----------------------

const BridgeNpcSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  role: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  gmSpoiler: z.string().optional(),
  player_visible: z.boolean().optional(),
});

const BridgeLocationSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  type: z.string().optional(),
  description: z.string().optional(),
  aspects: z.array(z.string()).optional(),
  notes: z.string().optional(),
  player_visible: z.boolean().optional(),
});

const BridgeMonsterObjectSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  cr: z.string().optional(),
  hp: z.string().optional(),
  ac: z.string().optional(),
  notes: z.string().optional(),
  summary: z.string().optional(),
});

const BridgeMonsterSchema = z.union([z.string().min(1), BridgeMonsterObjectSchema]);

const BridgeItemObjectSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  rarity: z.string().optional(),
  mechanic: z.string().optional(),
  player_visible: z.boolean().optional(),
});

const BridgeItemSchema = z.union([z.string().min(1), BridgeItemObjectSchema]);

const BridgeJournalEntrySchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  content: z.string().optional(),
  sessionNumber: z.number().int().min(1).optional(),
  keyClues: z.array(z.string()).optional(),
  nextObjectives: z.array(z.string()).optional(),
});

const BridgeQuestSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  status: z.enum(['active', 'completed', 'failed']).optional(),
  notes: z.string().optional(),
  category: z.enum(['quest', 'goal', 'rumor', 'mystery']).optional(),
});

const BridgeRecapObjectSchema = z.object({
  title: z.string().optional(),
  previouslyOn: z.string().optional(),
  text: z.string().optional(),
  highlights: z.array(z.string()).optional(),
  unresolvedThreads: z.array(z.string()).optional(),
});

const BridgeRecapSchema = z.union([z.string(), BridgeRecapObjectSchema]);

export const GeminiBridgePayloadSchema = z
  .object({
    recapTitle: z.string().optional(),
    previouslyOnRecap: z.string().optional(),
    recap: BridgeRecapSchema.optional(),
    summary: z.string().optional(),
    keyHighlights: z.array(z.string()).optional(),
    unresolvedThreads: z.array(z.string()).optional(),
    npcs: z.array(BridgeNpcSchema).optional(),
    locations: z.array(BridgeLocationSchema).optional(),
    monsters: z.array(BridgeMonsterSchema).optional(),
    items: z.array(BridgeItemSchema).optional(),
    secrets: z.array(z.string().min(1)).optional(),
    scenes: z.array(z.string().min(1)).optional(),
    journalEntry: BridgeJournalEntrySchema.optional(),
    playerJournalEntry: BridgeJournalEntrySchema.optional(),
    quests: z.array(BridgeQuestSchema).optional(),
  })
  .refine(
    (val) => {
      const recapHasText =
        typeof val.recap === 'string'
          ? Boolean(val.recap.trim())
          : Boolean(val.recap?.previouslyOn?.trim() || val.recap?.text?.trim());
      return Boolean(
        val.previouslyOnRecap?.trim() ||
          recapHasText ||
          val.summary?.trim() ||
          (val.npcs && val.npcs.length > 0) ||
          (val.locations && val.locations.length > 0) ||
          (val.monsters && val.monsters.length > 0) ||
          (val.items && val.items.length > 0) ||
          (val.secrets && val.secrets.length > 0) ||
          (val.scenes && val.scenes.length > 0) ||
          val.journalEntry ||
          val.playerJournalEntry ||
          (val.quests && val.quests.length > 0),
      );
    },
    {
      message:
        'JSON payload must include at least one recap, journalEntry, NPC, location, monster, magic item, secret, scene, or quest.',
    },
  );

export type ValidatedGeminiBridgePayload = z.infer<typeof GeminiBridgePayloadSchema>;

export type GeminiBridgeDiffPreview = {
  hasRecap: boolean;
  recapTitle: string;
  recapText: string;
  keyHighlights: string[];
  unresolvedThreads: string[];
  npcsCount: number;
  locationsCount: number;
  monstersCount: number;
  itemsCount: number;
  secretsCount: number;
  scenesCount: number;
  questsCount: number;
  hasJournalEntry: boolean;
  hasPlayerJournal: boolean;
  totalDetectedItems: number;
  summaryLines: string[];
  summary: string[];
};

// ---- Step 1: Context-Aware Schema Prompt Generator -------------------------

export function buildGeminiBridgePrompt(opts: {
  preset: GeminiBridgePreset;
  campaignName?: string;
  campaignData?: Record<string, any> | null;
  playerProjection?: SlotProjection | null;
  playerTracker?: PlayerTrackerState | null;
  playerVisibleEntities?: Record<string, Array<Record<string, unknown>>>;
  playerState?: {
    pcName?: string;
    quests?: Array<{ id?: string; title: string; status?: string; notes?: string }>;
    journal?: Array<{ id?: string; sessionNumber?: number; date?: string; title?: string; content?: string }>;
    revealedEntities?: Array<{ id?: string; name: string; type?: string; category?: string }>;
  };
  customFocus?: string;
  customGuidance?: string;
}): string {
  const campaignTitle = opts.campaignName?.trim() || 'Tabletop RPG Campaign';
  const data = opts.campaignData && typeof opts.campaignData === 'object' ? opts.campaignData : {};
  const focusRaw = opts.customFocus?.trim() || opts.customGuidance?.trim() || '';
  const focusLine = focusRaw ? `\nAdditional Focus / Request: ${focusRaw}\n` : '';

  if (opts.preset === 'player_journal_summary') {
    // Strictly player-safe serialization: uses ONLY playerProjection + local playerTracker / playerState,
    // NEVER reading GM secrets or unrevealed entities.
    const proj = opts.playerProjection;
    const tracker = opts.playerTracker;
    const ps = opts.playerState;

    const pcNameLine = ps?.pcName ? `Adventurer / PC: ${ps.pcName}\n` : '';

    const revealedNpcs = ps?.revealedEntities
      ? ps.revealedEntities.map((e) => e.name).filter(Boolean)
      : proj
        ? (proj.entities?.npcs ?? []).map((n: any) => n.name || n.id).filter(Boolean)
        : (Array.isArray(data.npcs) ? data.npcs : [])
            .filter((n: any) => n && n.player_visible === true)
            .map((n: any) => n.name)
            .filter(Boolean);

    const revealedLocations = proj
      ? (proj.entities?.locations ?? []).map((l: any) => l.name || l.id).filter(Boolean)
      : (Array.isArray(data.locations) ? data.locations : [])
          .filter((l: any) => l && l.player_visible === true)
          .map((l: any) => l.name)
          .filter(Boolean);

    const feedEntries = proj
      ? (proj.sessionLog ?? []).slice(-10).map((e: any) => String(e.text || '')).filter(Boolean)
      : [];

    const localQuests = ps?.quests
      ? ps.quests.map((q) => `${q.title} (${q.status || 'active'})${q.notes ? `: ${q.notes}` : ''}`)
      : tracker
        ? tracker.quests.map((q) => `${q.title} (${q.status})${q.notes ? `: ${q.notes}` : ''}`)
        : (Array.isArray(data.__playerCompanionQuests) ? data.__playerCompanionQuests : []).map(
            (q: any) => `${q.title} (${q.status || 'active'})`,
          );

    const localJournals = ps?.journal
      ? ps.journal.slice(-5).map((j) => `Session ${j.sessionNumber ?? 1} — ${j.title || 'Entry'}: ${j.content || ''}`)
      : tracker
        ? tracker.journal.slice(-5).map((j) => `Session ${j.sessionNumber} — ${j.title}: ${j.content}`)
        : (Array.isArray(data.__playerCompanionJournal) ? data.__playerCompanionJournal : [])
            .slice(-5)
            .map((j: any) => `Session ${j.sessionNumber ?? 1} — ${j.title || 'Entry'}: ${j.content || ''}`);

    return [
      `You are an Adventurer's Chronicle Assistant for the campaign "${campaignTitle}".`,
      pcNameLine,
      `Synthesize my character's recent session notes, known NPCs, visited locations, and active quests into a cohesive Player Journal Summary and updated quest leads.`,
      focusLine,
      `=== KNOWN WORLD & REVEALED FEED ===`,
      `Known NPCs: ${revealedNpcs.length > 0 ? revealedNpcs.join(', ') : 'None recorded yet'}`,
      `Visited Locations: ${revealedLocations.length > 0 ? revealedLocations.join(', ') : 'None recorded yet'}`,
      `Recent Party Feed:\n${feedEntries.length > 0 ? feedEntries.map((f) => `- ${f}`).join('\n') : '- None'}`,
      ``,
      `=== MY LOCAL QUESTS & JOURNAL ===`,
      `Active Quests:\n${localQuests.length > 0 ? localQuests.map((q: string) => `- ${q}`).join('\n') : '- None'}`,
      `Recent Journal Notes:\n${localJournals.length > 0 ? localJournals.map((j: string) => `- ${j}`).join('\n') : '- None'}`,
      ``,
      `Return ONLY valid JSON matching this exact TypeScript schema (no extra commentary outside the JSON block):`,
      '```json',
      `{`,
      `  "journalEntry": {`,
      `    "title": "Episode title for this journal entry",`,
      `    "summary": "2-3 paragraph in-character or table journal summary",`,
      `    "keyClues": ["Key clue 1", "Key clue 2"],`,
      `    "nextObjectives": ["Next party objective 1", "Next party objective 2"]`,
      `  },`,
      `  "quests": [`,
      `    {`,
      `      "title": "Follow-up quest or rumor title",`,
      `      "status": "active",`,
      `      "category": "quest",`,
      `      "notes": "Brief actionable summary"`,
      `    }`,
      `  ]`,
      `}`,
      '```',
    ].join('\n');
  }

  if (opts.preset === 'session_recap') {
    const sessionLogsV2 = Array.isArray(data.sessionLogV2) ? data.sessionLogV2 : [];
    const legacyLogs = Array.isArray(data.sessionLogs) ? data.sessionLogs : [];
    const playerLog = Array.isArray(data.playerLog) ? data.playerLog : [];

    const recentLogs: string[] = [];
    for (const entry of sessionLogsV2.slice(-5)) {
      if (entry && (entry.title || entry.recap)) {
        recentLogs.push(
          `Session ${entry.number ?? ''}${entry.title ? ` (${entry.title})` : ''}: ${entry.recap || ''}`,
        );
      }
    }
    if (recentLogs.length === 0) {
      for (const l of legacyLogs.slice(0, 5)) {
        if (l && (l.title || l.body || l.summary)) {
          recentLogs.push(`${l.title || 'Session'}: ${l.body || l.summary || ''}`);
        }
      }
    }
    for (const p of playerLog.slice(-8)) {
      if (p && typeof p.text === 'string' && p.text.trim()) {
        recentLogs.push(`Feed: ${p.text.trim()}`);
      }
    }

    const activeQuests = (Array.isArray(data.pcGoals) ? data.pcGoals : [])
      .filter((g: any) => g && typeof g.text === 'string' && g.text.trim())
      .map((g: any) => `${g.text.trim()} [${g.status || 'Active'}]`);

    const npcs = (Array.isArray(data.npcs) ? data.npcs : [])
      .slice(0, 15)
      .map((n: any) => `${n.name}${n.role ? ` (${n.role})` : ''}`)
      .filter(Boolean);

    const locations = (Array.isArray(data.locations) ? data.locations : [])
      .slice(0, 15)
      .map((l: any) => `${l.name}${l.type ? ` (${l.type})` : ''}`)
      .filter(Boolean);

    return [
      `You are the Narrative Recap Compiler for the tabletop RPG campaign "${campaignTitle}".`,
      `Write a punchy, atmospheric "Previously On..." session recap ready to read aloud at the start of the next session.`,
      focusLine,
      `=== CAMPAIGN CONTEXT ===`,
      `Recent Session Logs & Feed:\n${recentLogs.length > 0 ? recentLogs.map((l) => `- ${l}`).join('\n') : '- Campaign opening session'}`,
      `Active Quests & PC Goals:\n${activeQuests.length > 0 ? activeQuests.map((q: string) => `- ${q}`).join('\n') : '- None'}`,
      `Key NPCs: ${npcs.length > 0 ? npcs.join(', ') : 'None yet'}`,
      `Visited / Known Locations: ${locations.length > 0 ? locations.join(', ') : 'None yet'}`,
      ``,
      `Return ONLY valid JSON matching this exact TypeScript schema (no markdown commentary outside the JSON block):`,
      '```json',
      `{`,
      `  "recapTitle": "Previously on ${campaignTitle}...",`,
      `  "previouslyOnRecap": "Dramatic 2-3 paragraph read-aloud recap of recent events and stakes.",`,
      `  "keyHighlights": [`,
      `    "Key highlight 1",`,
      `    "Key highlight 2"`,
      `  ],`,
      `  "unresolvedThreads": [`,
      `    "Open question or looming threat 1",`,
      `    "Open question or looming threat 2"`,
      `  ]`,
      `}`,
      '```',
    ].join('\n');
  }

  // Preset: 'structured_entities'
  const genre = typeof data.genre === 'string' && data.genre.trim() ? data.genre.trim() : 'Fantasy Adventure';
  const pitch = typeof data.pitch === 'string' && data.pitch.trim() ? data.pitch.trim() : '';
  const tone = Array.isArray(data.tone)
    ? data.tone.filter(Boolean).join(', ')
    : typeof data.tone === 'string' && data.tone.trim()
      ? data.tone.trim()
      : 'Atmospheric, heroic';
  const worldFacts = [
    ...(Array.isArray(data.gWorld) ? data.gWorld : []),
    ...(Array.isArray(data.facts) ? data.facts : []),
  ]
    .filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
    .slice(0, 12);

  const pcs = Array.isArray(data.pcs) ? data.pcs : [];
  const levels = pcs
    .map((p: any) => (typeof p?.level === 'number' ? p.level : Number(p?.level) || 0))
    .filter((n: number) => n > 0);
  const avgPartyLevel =
    levels.length > 0 ? Math.round(levels.reduce((a: number, b: number) => a + b, 0) / levels.length) : 3;

  return [
    `You are a Lazy DM Campaign Prep Architect for "${campaignTitle}".`,
    `Generate structured, table-ready NPCs, Locations, Monsters, Magic Items, and Secrets tailored to this campaign.`,
    focusLine,
    `=== CAMPAIGN SETTING & PARTY ===`,
    `Genre: ${genre}`,
    `Tone Pillars: ${tone}`,
    ...(pitch ? [`Campaign Pitch: ${pitch}`] : []),
    `Active Party Level: Level ${avgPartyLevel} (${pcs.length || 4} adventurers)`,
    `World Facts:\n${worldFacts.length > 0 ? worldFacts.map((f) => `- ${f}`).join('\n') : '- Classic high-adventure setting'}`,
    ``,
    `Return ONLY valid JSON matching this exact TypeScript schema (no extra text outside the JSON block):`,
    '```json',
    `{`,
    `  "npcs": [`,
    `    {`,
    `      "name": "NPC Name",`,
    `      "role": "Faction / Archetype",`,
    `      "description": "Visual impression, voice cue, and immediate motivation",`,
    `      "notes": "How they interact with the party",`,
    `      "gmSpoiler": "Hidden allegiance or secret"`,
    `    }`,
    `  ],`,
    `  "locations": [`,
    `    {`,
    `      "name": "Location Name",`,
    `      "type": "Dungeon / Landmark / District",`,
    `      "description": "Evocative sensory overview",`,
    `      "aspects": ["Interactive feature 1", "Hazard or lighting cue 2", "Secret door or reward 3"]`,
    `    }`,
    `  ],`,
    `  "monsters": [`,
    `    {`,
    `      "name": "Monster or Adversary Name",`,
    `      "cr": "${avgPartyLevel}",`,
    `      "hp": "65",`,
    `      "ac": "15",`,
    `      "notes": "Signature tactical move"`,
    `    }`,
    `  ],`,
    `  "items": [`,
    `    {`,
    `      "name": "Relic or Magic Item Name",`,
    `      "rarity": "Uncommon",`,
    `      "description": "Lore and mechanical effect"`,
    `    }`,
    `  ],`,
    `  "secrets": [`,
    `    "Actionable secret or clue the party can uncover in the next session"`,
    `  ]`,
    `}`,
    '```',
  ].join('\n');
}

// ---- Step 2: Fence Stripping, JSON Validation, Diff Preview & Apply --------

/**
 * Strips markdown ```json ... ``` or ``` ... ``` fences (and any surrounding
 * conversational text before/after the fenced block or outermost `{ ... }`).
 */
export function stripMarkdownCodeFences(rawText: string): string {
  const trimmed = (rawText ?? '').trim();
  if (!trimmed) return '';

  const fenceMatch = trimmed.match(/```(?:json|ts|typescript|javascript)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1].trim();
  }

  let cleaned = trimmed
    .replace(/^```(?:json|ts|typescript|javascript)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return cleaned.trim();
}

export function buildGeminiDiffPreview(
  payloadOrData: ValidatedGeminiBridgePayload | Record<string, any>,
  maybePayload?: ValidatedGeminiBridgePayload,
): GeminiBridgeDiffPreview {
  const payload = (maybePayload ?? payloadOrData) as ValidatedGeminiBridgePayload;

  const recapObj = typeof payload.recap === 'object' && payload.recap ? payload.recap : null;
  const recapStr = typeof payload.recap === 'string' ? payload.recap : '';

  const recapText = (
    payload.previouslyOnRecap ||
    recapStr ||
    recapObj?.previouslyOn ||
    recapObj?.text ||
    payload.summary ||
    ''
  ).trim();
  const recapTitle = (
    payload.recapTitle ||
    recapObj?.title ||
    'Previously On...'
  ).trim();
  const hasRecap = recapText.length > 0;
  const keyHighlights = payload.keyHighlights ?? recapObj?.highlights ?? [];
  const unresolvedThreads = payload.unresolvedThreads ?? recapObj?.unresolvedThreads ?? [];

  const npcsCount = payload.npcs?.length ?? 0;
  const locationsCount = payload.locations?.length ?? 0;
  const monstersCount = payload.monsters?.length ?? 0;
  const itemsCount = payload.items?.length ?? 0;
  const secretsCount = payload.secrets?.length ?? 0;
  const scenesCount = payload.scenes?.length ?? 0;
  const questsCount = payload.quests?.length ?? 0;
  const journalEntryObj = payload.journalEntry ?? payload.playerJournalEntry;
  const hasJournalEntry = Boolean(journalEntryObj);

  const summaryLines: string[] = [];
  if (hasRecap) summaryLines.push(`Session Recap: "${recapTitle}" (${recapText.length} chars)`);
  if (npcsCount > 0) summaryLines.push(`${npcsCount} NPC${npcsCount === 1 ? '' : 's'} (${payload.npcs!.map((n) => n.name).join(', ')})`);
  if (locationsCount > 0) summaryLines.push(`${locationsCount} Location${locationsCount === 1 ? '' : 's'} (${payload.locations!.map((l) => l.name).join(', ')})`);
  if (monstersCount > 0) {
    const names = payload.monsters!.map((m) => (typeof m === 'string' ? m : m.name));
    summaryLines.push(`${monstersCount} Monster${monstersCount === 1 ? '' : 's'} (${names.join(', ')})`);
  }
  if (itemsCount > 0) {
    const names = payload.items!.map((i) => (typeof i === 'string' ? i : i.name));
    summaryLines.push(`${itemsCount} Magic Item${itemsCount === 1 ? '' : 's'} (${names.join(', ')})`);
  }
  if (secretsCount > 0) summaryLines.push(`${secretsCount} Secret${secretsCount === 1 ? '' : 's'} & Clues`);
  if (scenesCount > 0) summaryLines.push(`${scenesCount} Scene${scenesCount === 1 ? '' : 's'}`);
  if (hasJournalEntry) summaryLines.push(`Player Journal: "${journalEntryObj!.title}"`);
  if (questsCount > 0) summaryLines.push(`${questsCount} Quest${questsCount === 1 ? '' : 's'} / Leads`);

  const totalDetectedItems =
    (hasRecap ? 1 : 0) +
    npcsCount +
    locationsCount +
    monstersCount +
    itemsCount +
    secretsCount +
    scenesCount +
    questsCount +
    (hasJournalEntry ? 1 : 0);

  return {
    hasRecap,
    recapTitle,
    recapText,
    keyHighlights,
    unresolvedThreads,
    npcsCount,
    locationsCount,
    monstersCount,
    itemsCount,
    secretsCount,
    scenesCount,
    questsCount,
    hasJournalEntry,
    hasPlayerJournal: hasJournalEntry,
    totalDetectedItems,
    summaryLines,
    summary: summaryLines,
  };
}

export function parseAndValidateGeminiBridgeJson(rawInput: string):
  | {
      ok: true;
      cleanedJson: string;
      payload: ValidatedGeminiBridgePayload;
      preview: GeminiBridgeDiffPreview;
      diff: GeminiBridgeDiffPreview;
    }
  | {
      ok: false;
      cleanedJson: string;
      error: string;
    } {
  const cleanedJson = stripMarkdownCodeFences(rawInput);
  if (!cleanedJson) {
    return {
      ok: false,
      cleanedJson: '',
      error: 'Clipboard / input is empty. Paste the JSON block returned by Gemini.',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanedJson);
  } catch (err: any) {
    return {
      ok: false,
      cleanedJson,
      error: `Invalid JSON syntax: ${err?.message || 'Could not parse JSON'}`,
    };
  }

  const validation = GeminiBridgePayloadSchema.safeParse(parsed);
  if (!validation.success) {
    const firstIssue = validation.error.issues[0];
    const pathStr = firstIssue?.path?.length ? `${firstIssue.path.join('.')}: ` : '';
    return {
      ok: false,
      cleanedJson,
      error: `Schema validation failed (${pathStr}${firstIssue?.message || 'Invalid shape'})`,
    };
  }

  const preview = buildGeminiDiffPreview(validation.data);
  return {
    ok: true,
    cleanedJson,
    payload: validation.data,
    preview,
    diff: preview,
  };
}

export const validateAndParseGeminiBridgeJson = parseAndValidateGeminiBridgeJson;

function makeEntityId(prefix: string, idx: number, nowMs: number): string {
  return `${prefix}_${nowMs}_${idx}_${Math.random().toString(36).slice(2, 7)}`;
}

export function applyGeminiBridgePayload(args: {
  campaignId?: string;
  campaignName?: string;
  currentState?: Record<string, any>;
  currentData?: Record<string, any>;
  campaignData?: Record<string, any>;
  currentTracker?: PlayerTrackerState | null;
  payload: ValidatedGeminiBridgePayload;
  publishRecapToPartyFeed?: boolean;
  captureSnapshot?: boolean;
  nowMs?: number;
  now?: number;
}): Record<string, any> & {
  nextState: Record<string, any>;
  nextData: Record<string, any>;
  preApplySnapshot: VaultSnapshot | null;
  undoSnapshot: VaultSnapshot;
  preview: GeminiBridgeDiffPreview;
  diff: GeminiBridgeDiffPreview;
  undoSnapshotState: Record<string, any>;
  nextTracker?: PlayerTrackerState | null;
} {
  const nowMs = args.nowMs ?? args.now ?? Date.now();
  const baseState = args.currentState ?? args.currentData ?? args.campaignData ?? {};
  const undoSnapshotState = structuredClone(baseState);
  const nextState = structuredClone(baseState);
  const preview = buildGeminiDiffPreview(args.payload);

  const campId = args.campaignId || 'local_campaign';
  let preApplySnapshot: VaultSnapshot | null = null;
  if (args.captureSnapshot !== false) {
    preApplySnapshot = captureVaultSnapshot({
      campaignId: campId,
      campaignName: args.campaignName || 'Campaign',
      reason: 'gemini_bridge_apply',
      label: `Before Gemini Bridge (${preview.summaryLines[0] || 'Import'})`,
      state: undoSnapshotState,
      nowMs,
    });
  }

  const fallbackUndoSnapshot: VaultSnapshot = preApplySnapshot ?? {
    id: makeSnapshotId(nowMs),
    campaignId: campId,
    campaignName: args.campaignName || 'Campaign',
    reason: 'gemini_bridge_apply',
    label: 'Before Gemini Bridge',
    createdAtMs: nowMs,
    createdAt: nowMs,
    state: undoSnapshotState,
    data: undoSnapshotState,
    summary: summarizeCampaignState(undoSnapshotState),
  };

  const { payload } = args;

  // 1. Merge NPCs
  if (payload.npcs && payload.npcs.length > 0) {
    const existingNpcs = Array.isArray(nextState.npcs) ? [...nextState.npcs] : [];
    payload.npcs.forEach((n, idx) => {
      existingNpcs.push({
        id: n.id || makeEntityId('npc', idx, nowMs),
        name: n.name.trim(),
        role: n.role || '',
        description: n.description || '',
        notes: n.notes || '',
        ...(n.gmSpoiler ? { gmSpoiler: n.gmSpoiler } : {}),
        player_visible: n.player_visible ?? false,
      });
    });
    nextState.npcs = existingNpcs;
  }

  // 2. Merge Locations
  if (payload.locations && payload.locations.length > 0) {
    const existingLocations = Array.isArray(nextState.locations) ? [...nextState.locations] : [];
    payload.locations.forEach((l, idx) => {
      existingLocations.push({
        id: l.id || makeEntityId('loc', idx, nowMs),
        name: l.name.trim(),
        type: l.type || '',
        description: l.description || '',
        aspects: Array.isArray(l.aspects) ? l.aspects : [],
        notes: l.notes || '',
        player_visible: l.player_visible ?? false,
      });
    });
    nextState.locations = existingLocations;
  }

  // 3. Merge Monsters
  if (payload.monsters && payload.monsters.length > 0) {
    const existingMonsters = Array.isArray(nextState.monsters) ? [...nextState.monsters] : [];
    payload.monsters.forEach((m) => {
      if (typeof m === 'string') {
        existingMonsters.push(m.trim());
      } else {
        const details = [
          m.cr ? `CR ${m.cr}` : '',
          m.hp ? `HP ${m.hp}` : '',
          m.ac ? `AC ${m.ac}` : '',
          m.notes || m.summary || '',
        ]
          .filter(Boolean)
          .join(' · ');
        existingMonsters.push(details ? `${m.name.trim()} (${details})` : m.name.trim());
      }
    });
    nextState.monsters = existingMonsters;
  }

  // 4. Merge Magic Items
  if (payload.items && payload.items.length > 0) {
    const existingItems = Array.isArray(nextState.items) ? [...nextState.items] : [];
    payload.items.forEach((it, idx) => {
      if (typeof it === 'string') {
        existingItems.push(it.trim());
      } else {
        existingItems.push({
          id: it.id || makeEntityId('item', idx, nowMs),
          name: it.name.trim(),
          description: it.description || '',
          ...(it.rarity ? { rarity: it.rarity } : {}),
          ...(it.mechanic ? { mechanic: it.mechanic } : {}),
          player_visible: it.player_visible ?? false,
          playerVisibility: 'full',
        });
      }
    });
    nextState.items = existingItems;
  }

  // 5. Merge Secrets & Scenes
  if (payload.secrets && payload.secrets.length > 0) {
    const existingSecrets = Array.isArray(nextState.secrets) ? [...nextState.secrets] : [];
    for (const s of payload.secrets) {
      if (s.trim()) existingSecrets.push(s.trim());
    }
    nextState.secrets = existingSecrets;
  }

  if (payload.scenes && payload.scenes.length > 0) {
    const existingScenes = Array.isArray(nextState.scenes) ? [...nextState.scenes] : [];
    for (const sc of payload.scenes) {
      if (sc.trim()) existingScenes.push(sc.trim());
    }
    nextState.scenes = existingScenes;
  }

  // 6. Merge "Previously On..." Session Recap
  if (preview.hasRecap) {
    const existingLogs = Array.isArray(nextState.sessionLogV2) ? [...nextState.sessionLogV2] : [];
    const nextNumber =
      existingLogs.reduce((max: number, e: any) => Math.max(max, typeof e?.number === 'number' ? e.number : 0), 0) + 1;
    const fullRecapBody = [
      preview.recapText,
      preview.keyHighlights.length > 0
        ? `\nKey Highlights:\n${preview.keyHighlights.map((h) => `• ${h}`).join('\n')}`
        : '',
      preview.unresolvedThreads.length > 0
        ? `\nOpen Threads:\n${preview.unresolvedThreads.map((t) => `• ${t}`).join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    existingLogs.push({
      id: makeEntityId('recap', nextNumber, nowMs),
      number: nextNumber,
      date: new Date(nowMs).toISOString().slice(0, 10),
      startedAt: nowMs,
      endedAt: nowMs,
      title: preview.recapTitle,
      recap: fullRecapBody,
      events: [],
      secretsRevealed: [],
      scenesUsed: [],
      goalUpdates: [],
    });
    nextState.sessionLogV2 = existingLogs;

    if (args.publishRecapToPartyFeed) {
      const existingPlayerLog: PlayerLogEntry[] = Array.isArray(nextState.playerLog)
        ? [...nextState.playerLog]
        : [];
      existingPlayerLog.push({
        id: makeLogEntryId(),
        text: `📜 ${preview.recapTitle}\n\n${fullRecapBody}`,
        mentions: [],
        visibility: { mode: 'party' },
        authorRef: 'gm',
        postedAtMs: nowMs,
      });
      nextState.playerLog = existingPlayerLog;
    }
  }

  // 7. Merge Player Journal Entry & Quests (Standalone Player Companion & Tracker)
  const je = payload.journalEntry ?? payload.playerJournalEntry;
  let nextTracker: PlayerTrackerState | null | undefined = args.currentTracker
    ? structuredClone(args.currentTracker)
    : undefined;

  if (je) {
    const existingJournal = Array.isArray(nextState.__playerCompanionJournal)
      ? [...nextState.__playerCompanionJournal]
      : [];
    const bodyParts = [
      je.summary || je.content || '',
      je.keyClues && je.keyClues.length > 0
        ? `\nKey Clues:\n${je.keyClues.map((c) => `• ${c}`).join('\n')}`
        : '',
      je.nextObjectives && je.nextObjectives.length > 0
        ? `\nNext Objectives:\n${je.nextObjectives.map((o) => `• ${o}`).join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const newEntry = {
      id: makeEntityId('pj', 0, nowMs),
      sessionNumber: je.sessionNumber ?? existingJournal.length + 1,
      date: new Date(nowMs).toISOString().slice(0, 10),
      title: je.title,
      content: bodyParts,
      sharedWithGm: false,
      linkedEntityIds: [] as string[],
      updatedAt: nowMs,
    };

    existingJournal.unshift(newEntry);
    nextState.__playerCompanionJournal = existingJournal;

    if (nextTracker) {
      nextTracker.journal = [newEntry, ...(nextTracker.journal ?? [])];
    }
  }

  if (payload.quests && payload.quests.length > 0) {
    const existingQuests = Array.isArray(nextState.__playerCompanionQuests)
      ? [...nextState.__playerCompanionQuests]
      : [];
    const addedQuests = payload.quests.map((q, idx) => ({
      id: q.id || makeEntityId('pq', idx, nowMs),
      title: q.title,
      status: q.status ?? ('active' as const),
      category: q.category ?? ('quest' as const),
      notes: q.notes ?? '',
      linkedEntityIds: [] as string[],
      sharedWithGm: false,
      updatedAt: nowMs,
    }));
    existingQuests.push(...addedQuests);
    nextState.__playerCompanionQuests = existingQuests;

    if (nextTracker) {
      nextTracker.quests = [...(nextTracker.quests ?? []), ...addedQuests];
    }
  }

  return {
    ...nextState,
    nextState,
    nextData: nextState,
    preApplySnapshot,
    undoSnapshot: fallbackUndoSnapshot,
    preview,
    diff: preview,
    undoSnapshotState,
    nextTracker,
  };
}
