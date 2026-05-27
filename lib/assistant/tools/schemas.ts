// Anthropic tool definitions for the Campaign Assistant. We hand-write the
// JSON Schemas (rather than deriving from zod, which this repo doesn't depend
// on) because the Messages API consumes JSON Schema directly. Read tools
// auto-execute server-side; write tools are surfaced to the user as proposals
// and never execute until approved.

import type { Anthropic } from '@anthropic-ai/sdk';

type Tool = {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
};

const ENTITY_TYPES = [
  'npc',
  'faction',
  'location',
  'secret',
  'pc',
  'magicItem',
  'fantasticLocation',
];

export const READ_TOOLS: Tool[] = [
  {
    name: 'searchEntities',
    description: 'Search campaign entities by name or text content.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 200 },
        types: { type: 'array', items: { type: 'string', enum: ENTITY_TYPES } },
        limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
      },
      required: ['query'],
    },
  },
  {
    name: 'getCampaignSummary',
    description:
      'Return high-level stats and metadata about the campaign: title, premise, party state, faction count, current world day, recent session count.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'getRecentSessions',
    description: 'Return the last N session log entries with transcripts.',
    input_schema: {
      type: 'object',
      properties: { n: { type: 'integer', minimum: 1, maximum: 10, default: 3 } },
    },
  },
  {
    name: 'getFactionStatus',
    description:
      'Return all factions with their clock progress, members, goals, and recent advances. Pass a factionId to scope to one faction.',
    input_schema: {
      type: 'object',
      properties: { factionId: { type: 'string' } },
    },
  },
  {
    name: 'getEntityDetails',
    description: 'Return full details for one entity by ID and type, including its relationships.',
    input_schema: {
      type: 'object',
      properties: {
        entityType: { type: 'string', enum: ENTITY_TYPES },
        entityId: { type: 'string' },
      },
      required: ['entityType', 'entityId'],
    },
  },
  {
    name: 'getDanglingThreads',
    description:
      'Return entities that have not been referenced in the last N sessions or scenes. Useful for surfacing forgotten content.',
    input_schema: {
      type: 'object',
      properties: { sessionsBack: { type: 'integer', minimum: 1, maximum: 20, default: 3 } },
    },
  },
];

export const WRITE_TOOLS: Tool[] = [
  {
    name: 'createNpc',
    description:
      'Propose a new NPC with name, traits, voice, goals. Do not invent stats; leave stat fields blank.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 80 },
        traits: { type: 'string', maxLength: 500 },
        voice: { type: 'string', maxLength: 200 },
        goals: { type: 'array', items: { type: 'string', maxLength: 200 }, maxItems: 5 },
        locationId: { type: 'string' },
        factionId: { type: 'string' },
      },
      required: ['name', 'traits', 'goals'],
    },
  },
  {
    name: 'createSecret',
    description: 'Propose a new secret or clue.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', minLength: 1, maxLength: 500 },
        knownByNpcIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['text'],
    },
  },
  {
    name: 'createPotentialScene',
    description:
      'Propose a new potential scene with type (action, exploration, social, mystery, travel) and a one-paragraph hook.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['action', 'exploration', 'social', 'mystery', 'travel'] },
        title: { type: 'string', minLength: 1, maxLength: 80 },
        hook: { type: 'string', minLength: 1, maxLength: 500 },
        locationId: { type: 'string' },
        involvedNpcIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['type', 'title', 'hook'],
    },
  },
  {
    name: 'addFactionClock',
    description: 'Propose a new clock attached to a faction.',
    input_schema: {
      type: 'object',
      properties: {
        factionId: { type: 'string' },
        name: { type: 'string', minLength: 1, maxLength: 80 },
        maxSegments: { type: 'integer', minimum: 2, maximum: 12 },
        description: { type: 'string', maxLength: 300 },
      },
      required: ['factionId', 'name', 'maxSegments'],
    },
  },
  {
    name: 'addRelationship',
    description: 'Propose a relationship between two entities.',
    input_schema: {
      type: 'object',
      properties: {
        fromType: { type: 'string' },
        fromId: { type: 'string' },
        toType: { type: 'string' },
        toId: { type: 'string' },
        kind: { type: 'string' },
        notes: { type: 'string', maxLength: 200 },
      },
      required: ['fromType', 'fromId', 'toType', 'toId', 'kind'],
    },
  },
  {
    name: 'addCluePath',
    description:
      'Propose a sequence of 3-5 clues leading to a target revelation. Per the "Three Clue Rule" — redundancy by design.',
    input_schema: {
      type: 'object',
      properties: {
        revelation: { type: 'string', minLength: 1, maxLength: 300 },
        clues: {
          type: 'array',
          items: { type: 'string', minLength: 1, maxLength: 200 },
          minItems: 3,
          maxItems: 5,
        },
      },
      required: ['revelation', 'clues'],
    },
  },
];

export const ALL_TOOLS = [...READ_TOOLS, ...WRITE_TOOLS] as unknown as Anthropic.Tool[];
export const READ_ONLY_TOOLS = READ_TOOLS as unknown as Anthropic.Tool[];
