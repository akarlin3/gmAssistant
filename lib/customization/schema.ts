// Strict Zod & JSON Schema Definitions + Domain Invariant Validator
// (`lib/customization/schema.ts`)
//
// Enforces hard domain boundaries for the Conversational Customization Layer:
// - Block durations strictly bounded between 5 and 60 minutes (`5..60m`)
// - Capacity ceilings bounded (`cruiseCeilingBlocks`: `1..24`, `surgeCeilingBlocks`: `1..32`)
// - Strict enum keys for channels, pillars, load modes, house rule categories, and HUD widgets
// - Non-destructive list updates (upserts & toggles only; destructive list wipes rejected)

import { z } from 'zod';
import {
  BUFF_EXPIRY_OPTIONS,
  CAMPAIGN_MODE_OPTIONS,
  HUD_DENSITY_OPTIONS,
  HUD_WIDGET_IDS,
  RECHARGE_TIMING_OPTIONS,
} from '@/lib/workspaceConfigCompiler';

// ---------------------------------------------------------------------------
// 1. Canonical Domain Enums
// ---------------------------------------------------------------------------

export const CUSTOMIZATION_PILLAR_KEYS = [
  'combat',
  'exploration',
  'social',
  'mystery',
  'intrigue',
  'worldbuilding',
  'craft',
] as const;
export type CustomizationPillarKey = (typeof CUSTOMIZATION_PILLAR_KEYS)[number];

export const CUSTOMIZATION_CHANNEL_KEYS = [
  'initiative',
  'rollFeed',
  'clocks',
  'audioNarration',
  'actionEconomy',
  'conspiracyBoard',
  'whispers',
  'houseRules',
  'prepNotes',
  'deepPrep',
  'worldbuilding',
  'encounterDesign',
  'Guitar',
  'Reading',
  'Writing',
] as const;
export type CustomizationChannelKey = (typeof CUSTOMIZATION_CHANNEL_KEYS)[number];

export const LOAD_MODE_OPTIONS = [
  'Tier 1',
  'Tier 2',
  'Tier 3',
  'Cruise',
  'Surge',
  'Recovery',
] as const;
export type LoadModeOption = (typeof LOAD_MODE_OPTIONS)[number];

export const HOUSE_RULE_CATEGORIES = [
  'combat',
  'exploration',
  'social',
  'resting',
  'magic',
  'gritty_survival',
  'custom',
] as const;
export type HouseRuleCategory = (typeof HOUSE_RULE_CATEGORIES)[number];

export const REST_VARIANT_OPTIONS = [
  'standard_5e',
  'gritty_realism',
  'heroic',
  'custom',
] as const;
export type RestVariantOption = (typeof REST_VARIANT_OPTIONS)[number];

export const BLOCK_DURATION_MIN_MINUTES = 5 as const;
export const BLOCK_DURATION_MAX_MINUTES = 60 as const;
export const CRUISE_CEILING_MIN_BLOCKS = 1 as const;
export const CRUISE_CEILING_MAX_BLOCKS = 24 as const;
export const SURGE_CEILING_MIN_BLOCKS = 1 as const;
export const SURGE_CEILING_MAX_BLOCKS = 32 as const;

const CHANNEL_CANONICAL_LOOKUP = new Map<string, CustomizationChannelKey>();
for (const key of CUSTOMIZATION_CHANNEL_KEYS) {
  CHANNEL_CANONICAL_LOOKUP.set(key.toLowerCase(), key);
  CHANNEL_CANONICAL_LOOKUP.set(
    key.replace(/([A-Z])/g, '_$1').toLowerCase(),
    key,
  );
  CHANNEL_CANONICAL_LOOKUP.set(
    key.replace(/([A-Z])/g, ' $1').toLowerCase().trim(),
    key,
  );
}
CHANNEL_CANONICAL_LOOKUP.set('investigation board', 'conspiracyBoard');
CHANNEL_CANONICAL_LOOKUP.set('conspiracy', 'conspiracyBoard');
CHANNEL_CANONICAL_LOOKUP.set('dice log', 'rollFeed');
CHANNEL_CANONICAL_LOOKUP.set('roll log', 'rollFeed');
CHANNEL_CANONICAL_LOOKUP.set('audio', 'audioNarration');
CHANNEL_CANONICAL_LOOKUP.set('narration', 'audioNarration');

export function normalizeChannelEnumKey(
  raw: string,
): CustomizationChannelKey | null {
  const cleaned = raw.trim().toLowerCase();
  return CHANNEL_CANONICAL_LOOKUP.get(cleaned) ?? null;
}

const PILLAR_CANONICAL_LOOKUP = new Map<string, CustomizationPillarKey>();
for (const p of CUSTOMIZATION_PILLAR_KEYS) {
  PILLAR_CANONICAL_LOOKUP.set(p.toLowerCase(), p);
}

export function normalizePillarEnumKey(
  raw: string,
): CustomizationPillarKey | null {
  return PILLAR_CANONICAL_LOOKUP.get(raw.trim().toLowerCase()) ?? null;
}

// ---------------------------------------------------------------------------
// 2. Strict Zod Schemas (Enforcing Domain Boundaries without Silent Out-of-Range Pass)
// ---------------------------------------------------------------------------

export const HouseRuleEntrySchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z0-9_-]+$/, 'House rule id must be alphanumeric/slug'),
    title: z.string().trim().min(1).max(80),
    category: z.enum(HOUSE_RULE_CATEGORIES),
    ruleText: z.string().trim().min(3).max(500),
    mechanicalSummary: z.string().trim().max(160).optional(),
    enabled: z.boolean().default(true),
    op: z.enum(['upsert', 'disable']).optional(),
  })
  .strict();

export type HouseRuleEntry = z.infer<typeof HouseRuleEntrySchema>;

export const StickyChannelConfigSchema = z
  .object({
    key: z.enum(CUSTOMIZATION_CHANNEL_KEYS),
    sticky: z.boolean(),
    pillar: z.enum(CUSTOMIZATION_PILLAR_KEYS).optional(),
    blockMinutes: z
      .number()
      .int()
      .min(
        BLOCK_DURATION_MIN_MINUTES,
        `Channel block duration must be at least ${BLOCK_DURATION_MIN_MINUTES}m`,
      )
      .max(
        BLOCK_DURATION_MAX_MINUTES,
        `Channel block duration cannot exceed ${BLOCK_DURATION_MAX_MINUTES}m`,
      )
      .optional(),
  })
  .strict();

export type StickyChannelConfig = z.infer<typeof StickyChannelConfigSchema>;

export const WorkflowAndRulesPatchSchema = z
  .object({
    blockDurationMinutes: z
      .number()
      .int('Block duration must be a whole number of minutes')
      .min(
        BLOCK_DURATION_MIN_MINUTES,
        `Block duration must be between ${BLOCK_DURATION_MIN_MINUTES} and ${BLOCK_DURATION_MAX_MINUTES} minutes`,
      )
      .max(
        BLOCK_DURATION_MAX_MINUTES,
        `Block duration must be between ${BLOCK_DURATION_MIN_MINUTES} and ${BLOCK_DURATION_MAX_MINUTES} minutes`,
      )
      .optional(),
    cruiseCeilingBlocks: z
      .number()
      .int('Cruise ceiling must be an integer block count')
      .min(
        CRUISE_CEILING_MIN_BLOCKS,
        `Cruise ceiling must be between ${CRUISE_CEILING_MIN_BLOCKS} and ${CRUISE_CEILING_MAX_BLOCKS} blocks`,
      )
      .max(
        CRUISE_CEILING_MAX_BLOCKS,
        `Cruise ceiling must be between ${CRUISE_CEILING_MIN_BLOCKS} and ${CRUISE_CEILING_MAX_BLOCKS} blocks`,
      )
      .optional(),
    surgeCeilingBlocks: z
      .number()
      .int('Surge ceiling must be an integer block count')
      .min(SURGE_CEILING_MIN_BLOCKS)
      .max(SURGE_CEILING_MAX_BLOCKS)
      .optional(),
    loadMode: z.enum(LOAD_MODE_OPTIONS).optional(),
    restVariant: z.enum(REST_VARIANT_OPTIONS).optional(),
    activePillars: z
      .array(z.enum(CUSTOMIZATION_PILLAR_KEYS))
      .min(1, 'activePillars cannot be destructively emptied')
      .max(7)
      .optional(),
    channels: z
      .array(StickyChannelConfigSchema)
      .min(1, 'channels list update must be non-empty (non-destructive)')
      .max(15)
      .optional(),
    autoSnapshotIntervalMinutes: z
      .number()
      .int()
      .min(BLOCK_DURATION_MIN_MINUTES)
      .max(BLOCK_DURATION_MAX_MINUTES)
      .optional(),
  })
  .strict();

export type WorkflowAndRulesPatch = z.infer<typeof WorkflowAndRulesPatchSchema>;

export const StrictCustomizationMutationSchema = z
  .object({
    campaignMode: z
      .object({
        mode: z.enum(CAMPAIGN_MODE_OPTIONS).optional(),
        prepTargetOverrides: z
          .record(z.string(), z.number().int().min(0).max(99))
          .optional(),
      })
      .strict()
      .optional(),
    workflow: WorkflowAndRulesPatchSchema.optional(),
    houseRules: z
      .array(HouseRuleEntrySchema)
      .min(1, 'houseRules update must be non-empty (use op: "disable" instead of wiping list)')
      .max(25)
      .optional(),
    systemFlavorAndTrackers: z
      .object({
        genre: z.string().trim().min(1).max(80).optional(),
        toneTags: z
          .array(z.string().trim().min(1).max(40))
          .min(1, 'toneTags update must be non-empty')
          .max(16)
          .optional(),
        resourcePoolTemplates: z
          .array(
            z
              .object({
                id: z.string().min(1).max(64).optional(),
                name: z.string().trim().min(1).max(60),
                max: z.number().int().min(1).max(999),
                rechargeOn: z.enum(RECHARGE_TIMING_OPTIONS),
              })
              .strict(),
          )
          .min(1, 'resourcePoolTemplates update must be non-empty')
          .max(20)
          .optional(),
        conditionBuffPresets: z
          .array(
            z
              .object({
                id: z.string().min(1).max(64).optional(),
                name: z.string().trim().min(1).max(60),
                description: z.string().trim().max(240).optional(),
                acBonus: z.number().int().min(-20).max(20).optional(),
                speedBonus: z.number().int().min(-60).max(120).optional(),
                saveBonusFormula: z.string().trim().max(32).optional(),
                attackBonusFormula: z.string().trim().max(32).optional(),
                checkBonusFormula: z.string().trim().max(32).optional(),
                rollModeOverride: z
                  .enum(['normal', 'advantage', 'disadvantage'])
                  .optional(),
                expiresOn: z.enum(BUFF_EXPIRY_OPTIONS).optional(),
              })
              .strict(),
          )
          .min(1, 'conditionBuffPresets update must be non-empty')
          .max(24)
          .optional(),
        clockCategories: z
          .array(z.string().trim().min(1).max(40))
          .min(1, 'clockCategories update must be non-empty')
          .max(20)
          .optional(),
      })
      .strict()
      .optional(),
    terminologyMap: z
      .record(z.string().trim().min(1).max(48), z.string().trim().min(1).max(48))
      .optional(),
    hudLayoutPrefs: z
      .object({
        density: z.enum(HUD_DENSITY_OPTIONS).optional(),
        widgetOrder: z.array(z.enum(HUD_WIDGET_IDS)).max(12).optional(),
        widgets: z
          .object({
            initiative: z
              .object({
                visible: z.boolean().optional(),
                order: z.number().int().min(0).max(50).optional(),
                pinnedTop: z.boolean().optional(),
              })
              .strict()
              .optional(),
            rollFeed: z
              .object({
                visible: z.boolean().optional(),
                order: z.number().int().min(0).max(50).optional(),
                pinnedTop: z.boolean().optional(),
              })
              .strict()
              .optional(),
            clocks: z
              .object({
                visible: z.boolean().optional(),
                order: z.number().int().min(0).max(50).optional(),
                pinnedTop: z.boolean().optional(),
              })
              .strict()
              .optional(),
            audioNarration: z
              .object({
                visible: z.boolean().optional(),
                order: z.number().int().min(0).max(50).optional(),
                pinnedTop: z.boolean().optional(),
              })
              .strict()
              .optional(),
            actionEconomy: z
              .object({
                visible: z.boolean().optional(),
                order: z.number().int().min(0).max(50).optional(),
                pinnedTop: z.boolean().optional(),
              })
              .strict()
              .optional(),
            conspiracyBoard: z
              .object({
                visible: z.boolean().optional(),
                order: z.number().int().min(0).max(50).optional(),
                pinnedTop: z.boolean().optional(),
              })
              .strict()
              .optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type StrictCustomizationMutation = z.infer<
  typeof StrictCustomizationMutationSchema
>;

export const StructuredLlmCustomizationEnvelopeSchema = z
  .object({
    intent: z.enum(['mutate', 'undo', 'clarify', 'reject']),
    reply: z.string().trim().min(1).max(1500),
    mutation: StrictCustomizationMutationSchema.optional(),
    clarificationOptions: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64),
            label: z.string().trim().min(1).max(90),
            promptReply: z.string().trim().min(1).max(320),
          })
          .strict(),
      )
      .max(4)
      .optional(),
  })
  .strict();

export type StructuredLlmCustomizationEnvelope = z.infer<
  typeof StructuredLlmCustomizationEnvelopeSchema
>;

// ---------------------------------------------------------------------------
// 3. Canonical Active Configuration State Shape
// ---------------------------------------------------------------------------

export interface ActiveCustomizationConfig {
  campaignMode: {
    mode: (typeof CAMPAIGN_MODE_OPTIONS)[number];
    prepTargetOverrides: Record<string, number>;
  };
  workflow: {
    blockDurationMinutes: number;
    cruiseCeilingBlocks: number;
    surgeCeilingBlocks: number;
    loadMode: LoadModeOption;
    restVariant: RestVariantOption;
    activePillars: CustomizationPillarKey[];
    channels: StickyChannelConfig[];
    autoSnapshotIntervalMinutes: number;
  };
  houseRules: HouseRuleEntry[];
  systemFlavorAndTrackers: {
    genre?: string;
    toneTags: string[];
    resourcePoolTemplates: Array<{
      id?: string;
      name: string;
      max: number;
      rechargeOn: (typeof RECHARGE_TIMING_OPTIONS)[number];
    }>;
    conditionBuffPresets: Array<{
      id?: string;
      name: string;
      description?: string;
      acBonus?: number;
      speedBonus?: number;
      saveBonusFormula?: string;
      attackBonusFormula?: string;
      checkBonusFormula?: string;
      rollModeOverride?: 'normal' | 'advantage' | 'disadvantage';
      expiresOn?: (typeof BUFF_EXPIRY_OPTIONS)[number];
    }>;
    clockCategories: string[];
  };
  terminologyMap: Record<string, string>;
  hudLayoutPrefs: {
    density: (typeof HUD_DENSITY_OPTIONS)[number];
    widgetOrder: Array<(typeof HUD_WIDGET_IDS)[number]>;
    widgets: Partial<
      Record<
        (typeof HUD_WIDGET_IDS)[number],
        { visible?: boolean; order?: number; pinnedTop?: boolean }
      >
    >;
  };
}

export function createDefaultActiveCustomizationConfig(): ActiveCustomizationConfig {
  return {
    campaignMode: {
      mode: 'standard',
      prepTargetOverrides: {},
    },
    workflow: {
      blockDurationMinutes: 25,
      cruiseCeilingBlocks: 8,
      surgeCeilingBlocks: 12,
      loadMode: 'Cruise',
      restVariant: 'standard_5e',
      activePillars: ['combat', 'exploration', 'social'],
      channels: [
        { key: 'initiative', sticky: false, pillar: 'combat' },
        { key: 'clocks', sticky: false, pillar: 'exploration' },
      ],
      autoSnapshotIntervalMinutes: 15,
    },
    houseRules: [],
    systemFlavorAndTrackers: {
      toneTags: [],
      resourcePoolTemplates: [],
      conditionBuffPresets: [],
      clockCategories: [],
    },
    terminologyMap: {},
    hudLayoutPrefs: {
      density: 'comfortable',
      widgetOrder: [...HUD_WIDGET_IDS],
      widgets: {},
    },
  };
}

// ---------------------------------------------------------------------------
// 4. Domain Guardrails & Invariant Validator
// ---------------------------------------------------------------------------

export interface GuardrailValidationReport {
  valid: boolean;
  violations: string[];
  warnings: string[];
  strippedKeys: string[];
  validatedMutation?: StrictCustomizationMutation;
}

const DESTRUCTIVE_OPS = new Set([
  'delete_all',
  'clear',
  'wipe',
  'replace_all',
  'drop',
  'truncate',
]);

const FORBIDDEN_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'gmNotes',
  'gmSecrets',
  'gmSpoiler',
  'secretNotes',
  'tokenHash',
  'tokenSalt',
]);

function scanDestructiveAndForbidden(
  raw: unknown,
  path: string,
  violations: string[],
  strippedKeys: string[],
): unknown {
  if (raw === null || raw === undefined || typeof raw !== 'object') {
    return raw;
  }
  if (Array.isArray(raw)) {
    return raw.map((item, idx) =>
      scanDestructiveAndForbidden(item, `${path}[${idx}]`, violations, strippedKeys),
    );
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(k)) {
      strippedKeys.push(path ? `${path}.${k}` : k);
      violations.push(
        `Forbidden or protected key "${k}" is not allowed in customization mutations.`,
      );
      continue;
    }
    if (
      (k === 'op' || k === 'operation' || k === 'listAction') &&
      typeof v === 'string' &&
      DESTRUCTIVE_OPS.has(v.toLowerCase())
    ) {
      violations.push(
        `Destructive list operation "${v}" at "${path || 'root'}" is forbidden; only non-destructive upserts or item-level disables are allowed.`,
      );
      continue;
    }
    if (k === 'destructiveClear' && v === true) {
      violations.push(
        `Destructive list clear at "${path || 'root'}" is forbidden by guardrail invariants.`,
      );
      continue;
    }
    out[k] = scanDestructiveAndForbidden(
      v,
      path ? `${path}.${k}` : k,
      violations,
      strippedKeys,
    );
  }
  return out;
}

/**
 * Enforces strict Zod types AND domain boundary invariants on a candidate mutation.
 * Unlike permissive UI clamping, out-of-range block durations (<5m or >60m),
 * unknown channel/pillar enum keys, destructive list wipes, and player attempts
 * to mutate GM-only campaign scopes are explicitly flagged and rejected.
 */
export function validateCustomizationMutation(
  rawCandidate: unknown,
  opts: {
    role?: 'gm' | 'player';
    isCampaignOwner?: boolean;
    existingConfig?: Partial<ActiveCustomizationConfig>;
  } = {},
): GuardrailValidationReport {
  const violations: string[] = [];
  const warnings: string[] = [];
  const strippedKeys: string[] = [];

  if (!rawCandidate || typeof rawCandidate !== 'object' || Array.isArray(rawCandidate)) {
    return {
      valid: false,
      violations: ['Customization mutation must be a non-null JSON object.'],
      warnings,
      strippedKeys,
    };
  }

  const scanned = scanDestructiveAndForbidden(
    rawCandidate,
    '',
    violations,
    strippedKeys,
  ) as Record<string, unknown>;

  // Pre-check empty-array destructive wipes against existing non-empty lists
  const existing = opts.existingConfig;
  if (
    Array.isArray(scanned.houseRules) &&
    scanned.houseRules.length === 0 &&
    (existing?.houseRules?.length ?? 0) > 0
  ) {
    violations.push(
      'Destructive wipe of houseRules ([]) is forbidden; disable individual rules with op: "disable".',
    );
  }
  if (
    scanned.workflow &&
    typeof scanned.workflow === 'object' &&
    !Array.isArray(scanned.workflow)
  ) {
    const wf = scanned.workflow as Record<string, unknown>;
    if (Array.isArray(wf.channels) && wf.channels.length === 0) {
      violations.push(
        'Destructive wipe of workflow.channels ([]) is forbidden; toggle sticky: false per channel instead.',
      );
    }
    if (Array.isArray(wf.activePillars) && wf.activePillars.length === 0) {
      violations.push(
        'Destructive wipe of workflow.activePillars ([]) is forbidden; at least one pillar must remain active.',
      );
    }
  }

  // Enforce role/authority invariant: non-GM / non-owner cannot mutate campaign-wide rules
  const isGmOwner =
    (opts.role ?? 'gm') === 'gm' && (opts.isCampaignOwner ?? true) === true;
  if (!isGmOwner) {
    if (scanned.houseRules !== undefined) {
      violations.push(
        'Authority violation: Players cannot add or mutate campaign-wide houseRules.',
      );
    }
    if (scanned.campaignMode !== undefined) {
      violations.push(
        'Authority violation: Players cannot mutate campaignMode or global prepTargetOverrides.',
      );
    }
  }

  const parsed = StrictCustomizationMutationSchema.safeParse(scanned);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const loc = issue.path.length > 0 ? issue.path.join('.') : 'mutation';
      violations.push(`${loc}: ${issue.message}`);
    }
  }

  if (violations.length > 0 || !parsed.success) {
    return {
      valid: false,
      violations,
      warnings,
      strippedKeys,
    };
  }

  return {
    valid: true,
    violations: [],
    warnings,
    strippedKeys,
    validatedMutation: parsed.data,
  };
}

// ---------------------------------------------------------------------------
// 5. Strict JSON Schema for LLM Structured Outputs (`output_config` / Tools)
// ---------------------------------------------------------------------------

export const CUSTOMIZATION_RESPONSE_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['intent', 'reply'],
  properties: {
    intent: {
      type: 'string',
      enum: ['mutate', 'undo', 'clarify', 'reject'],
    },
    reply: {
      type: 'string',
    },
    mutation: {
      type: 'object',
      additionalProperties: false,
      properties: {
        campaignMode: {
          type: 'object',
          additionalProperties: false,
          properties: {
            mode: {
              type: 'string',
              enum: [...CAMPAIGN_MODE_OPTIONS],
            },
            prepTargetOverrides: {
              type: 'object',
              additionalProperties: { type: 'integer' },
            },
          },
        },
        workflow: {
          type: 'object',
          additionalProperties: false,
          properties: {
            blockDurationMinutes: {
              type: 'integer',
              description: 'Session/prep block duration in minutes (strictly 5 to 60).',
            },
            cruiseCeilingBlocks: {
              type: 'integer',
              description: 'Default Cruise capacity ceiling in blocks (strictly 1 to 24).',
            },
            surgeCeilingBlocks: {
              type: 'integer',
              description: 'Surge capacity ceiling in blocks (strictly 1 to 32).',
            },
            loadMode: {
              type: 'string',
              enum: [...LOAD_MODE_OPTIONS],
            },
            restVariant: {
              type: 'string',
              enum: [...REST_VARIANT_OPTIONS],
            },
            activePillars: {
              type: 'array',
              items: {
                type: 'string',
                enum: [...CUSTOMIZATION_PILLAR_KEYS],
              },
            },
            channels: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['key', 'sticky'],
                properties: {
                  key: {
                    type: 'string',
                    enum: [...CUSTOMIZATION_CHANNEL_KEYS],
                  },
                  sticky: { type: 'boolean' },
                  pillar: {
                    type: 'string',
                    enum: [...CUSTOMIZATION_PILLAR_KEYS],
                  },
                  blockMinutes: {
                    type: 'integer',
                    description: 'Optional per-channel block duration (5 to 60 minutes).',
                  },
                },
              },
            },
            autoSnapshotIntervalMinutes: {
              type: 'integer',
              description: 'Auto-snapshot interval in minutes (5 to 60).',
            },
          },
        },
        houseRules: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'title', 'category', 'ruleText', 'enabled'],
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              category: {
                type: 'string',
                enum: [...HOUSE_RULE_CATEGORIES],
              },
              ruleText: { type: 'string' },
              mechanicalSummary: { type: 'string' },
              enabled: { type: 'boolean' },
              op: {
                type: 'string',
                enum: ['upsert', 'disable'],
              },
            },
          },
        },
        systemFlavorAndTrackers: {
          type: 'object',
          additionalProperties: false,
          properties: {
            genre: { type: 'string' },
            toneTags: { type: 'array', items: { type: 'string' } },
            resourcePoolTemplates: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'max', 'rechargeOn'],
                properties: {
                  name: { type: 'string' },
                  max: { type: 'integer' },
                  rechargeOn: {
                    type: 'string',
                    enum: [...RECHARGE_TIMING_OPTIONS],
                  },
                },
              },
            },
            conditionBuffPresets: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['name'],
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  acBonus: { type: 'integer' },
                  speedBonus: { type: 'integer' },
                  saveBonusFormula: { type: 'string' },
                  attackBonusFormula: { type: 'string' },
                  checkBonusFormula: { type: 'string' },
                  rollModeOverride: {
                    type: 'string',
                    enum: ['normal', 'advantage', 'disadvantage'],
                  },
                  expiresOn: {
                    type: 'string',
                    enum: [...BUFF_EXPIRY_OPTIONS],
                  },
                },
              },
            },
            clockCategories: { type: 'array', items: { type: 'string' } },
          },
        },
        terminologyMap: {
          type: 'object',
          additionalProperties: { type: 'string' },
        },
        hudLayoutPrefs: {
          type: 'object',
          additionalProperties: false,
          properties: {
            density: {
              type: 'string',
              enum: [...HUD_DENSITY_OPTIONS],
            },
            widgetOrder: {
              type: 'array',
              items: {
                type: 'string',
                enum: [...HUD_WIDGET_IDS],
              },
            },
            widgets: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  visible: { type: 'boolean' },
                  order: { type: 'integer' },
                  pinnedTop: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    },
    clarificationOptions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label', 'promptReply'],
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          promptReply: { type: 'string' },
        },
      },
    },
  },
};
