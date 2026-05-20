// Initiative tracker shared types and helpers. State persists under
// data.__initiative in the campaign blob; the panel is only mounted while
// Run Session mode is open.

export type CombatantSide = 'pc' | 'ally' | 'enemy' | 'neutral';

export type Combatant = {
  id: string;
  name: string;
  initiative: number;
  hp: { current: number; max: number };
  ac?: number;
  conditions: string[];
  side: CombatantSide;
  sourceMonsterId?: string;
  notes?: string;
};

export type InitiativeLogEntry = {
  round: number;
  text: string;
  ts: number;
};

export type InitiativeState = {
  combatants: Combatant[];
  round: number;
  activeIndex: number;
  log: InitiativeLogEntry[];
};

export const CONDITIONS = [
  'Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated',
  'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained',
  'Stunned', 'Unconscious', 'Concentrating', 'Bloodied',
];

const SIDE_PRIORITY: Record<CombatantSide, number> = {
  pc: 0,
  ally: 1,
  enemy: 2,
  neutral: 3,
};

export function sortInitiative(combatants: Combatant[]): Combatant[] {
  return [...combatants].sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    return SIDE_PRIORITY[a.side] - SIDE_PRIORITY[b.side];
  });
}

export function rollInitiative(modifier = 0): number {
  return Math.floor(Math.random() * 20) + 1 + modifier;
}

export function makeCombatantId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cmb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyInitiative(): InitiativeState {
  return { combatants: [], round: 1, activeIndex: 0, log: [] };
}

function appendLog(state: InitiativeState, text: string): InitiativeLogEntry[] {
  return [...state.log, { round: state.round, text, ts: Date.now() }];
}

export function nextTurn(state: InitiativeState): InitiativeState {
  if (state.combatants.length === 0) return state;
  const total = state.combatants.length;
  if (state.activeIndex + 1 >= total) {
    const round = state.round + 1;
    return {
      ...state,
      round,
      activeIndex: 0,
      log: [...state.log, { round, text: `Round ${round} begins`, ts: Date.now() }],
    };
  }
  return { ...state, activeIndex: state.activeIndex + 1 };
}

export function prevTurn(state: InitiativeState): InitiativeState {
  if (state.combatants.length === 0) return state;
  if (state.activeIndex - 1 < 0) {
    const round = Math.max(1, state.round - 1);
    return {
      ...state,
      round,
      activeIndex: state.combatants.length - 1,
      log: appendLog({ ...state, round }, `Returned to round ${round}`),
    };
  }
  return { ...state, activeIndex: state.activeIndex - 1 };
}

export function abilityMod(score: number | undefined | null): number {
  if (typeof score !== 'number' || isNaN(score)) return 0;
  return Math.floor((score - 10) / 2);
}
