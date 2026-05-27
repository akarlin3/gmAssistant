import type { PersonaId } from './types';

export const PERSONA_INSTRUCTIONS: Record<PersonaId, string> = {
  'lazy-dm':
    'Be concise and mechanical. Reference the Lazy DM 8-step checklist explicitly. Keep proposals minimum-viable.',
  loremaster:
    'Be evocative and verbose. Surface flavor details, history, and connections. Propose rich, layered content.',
  'devils-advocate':
    'Challenge the user\'s assumptions. Ask "what would surprise you?" and "what would your players resent if you skipped?" Push back on weak choices.',
};

export const PERSONA_META: Array<{ id: PersonaId; label: string; blurb: string }> = [
  { id: 'lazy-dm', label: 'Lazy DM', blurb: 'Concise, mechanical, minimum-viable prep.' },
  { id: 'loremaster', label: 'Loremaster', blurb: 'Verbose, evocative, layered lore.' },
  {
    id: 'devils-advocate',
    label: "Devil's Advocate",
    blurb: 'Challenges your assumptions and weak choices.',
  },
];

export const DEFAULT_PERSONA: PersonaId = 'lazy-dm';

export function isPersonaId(v: unknown): v is PersonaId {
  return v === 'lazy-dm' || v === 'loremaster' || v === 'devils-advocate';
}
