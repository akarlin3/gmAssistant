import { emptyCharacter, makeCharacterId, type Character } from './character-schema';

export type WizardPatch = {
  name?: string;
  soloMode?: boolean;
  pitch?: string;
  truths?: string[];
  pc?: { name: string; concept: string; goal: string };
  pcs?: Array<{ name: string; player?: string; concept?: string; goal?: string }>;
  front?: { name: string; goal: string; firstSign: string };
};

// Materialize a Character object from the wizard's lightweight PC fields.
export function makeWizardPC(name: string, concept: string): Character {
  const base = emptyCharacter();
  return {
    ...base,
    id: makeCharacterId(),
    name,
    notes: concept || '',
  };
}

// Fold a completed Session 0 wizard patch into a campaign `data` object. Pure:
// returns a new object and never mutates `base`. Always stamps
// `__session0Done` so the wizard is not re-shown for this campaign. Used both
// when re-running the wizard on an existing campaign and when deferring the
// first Firestore write until the wizard finishes for a brand-new campaign.
export function applySession0Patch(
  base: Record<string, any>,
  patch: WizardPatch,
): Record<string, any> {
  const next: Record<string, any> = { ...base, __session0Done: true };

  if (patch.soloMode !== undefined) next.__soloMode = patch.soloMode;
  if (patch.pitch) next.pitch = patch.pitch;

  if (patch.truths && patch.truths.length > 0) {
    const existing = Array.isArray(base.gWorld) ? (base.gWorld as string[]) : [];
    next.gWorld = [...existing, ...patch.truths];
  }

  if (patch.soloMode) {
    if (patch.pc) {
      const existingChars = Array.isArray(base.characters) ? (base.characters as Character[]) : [];
      next.characters = [...existingChars, makeWizardPC(patch.pc.name, patch.pc.concept)];
      if (patch.pc.goal) {
        const existingGoals = Array.isArray(base.pcGoals) ? (base.pcGoals as any[]) : [];
        next.pcGoals = [...existingGoals, { text: patch.pc.goal, timeframe: 'short', success: '', failure: '', linked: '' }];
      }
    }
  } else if (patch.pcs && patch.pcs.length > 0) {
    const existingChars = Array.isArray(base.characters) ? (base.characters as Character[]) : [];
    const newChars = patch.pcs.map((p) => {
      const char = makeWizardPC(p.name, p.concept || '');
      char.player = p.player || '';
      return char;
    });
    next.characters = [...existingChars, ...newChars];

    const goalsToAdd = patch.pcs
      .filter((p) => p.goal && p.goal.trim())
      .map((p) => ({ text: p.goal!.trim(), timeframe: 'short', success: '', failure: '', linked: '' }));
    if (goalsToAdd.length > 0) {
      const existingGoals = Array.isArray(base.pcGoals) ? (base.pcGoals as any[]) : [];
      next.pcGoals = [...existingGoals, ...goalsToAdd];
    }
  }

  if (patch.front) {
    const existingClocks = Array.isArray(base.clocks) ? (base.clocks as any[]) : [];
    const firstSignNote = patch.front.firstSign ? `First sign: ${patch.front.firstSign}` : '';
    next.clocks = [...existingClocks, {
      text: patch.front.goal || '',
      faction: patch.front.name,
      max: 6,
      filled: 0,
      notes: firstSignNote,
    }];
  }

  return next;
}
