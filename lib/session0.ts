import { emptyCharacter, makeCharacterId, type Character } from './character-schema';
import { makePc } from './pc/factory';
import type { PlayerCharacter } from './pc/types';

export type WizardPatch = {
  name?: string;
  soloMode?: boolean; // legacy
  mode?: 'solo' | 'duet' | 'standard'; // new mode
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

// Materialize a first-class PlayerCharacter object from the wizard's lightweight PC fields.
export function makeWizardFirstClassPC(name: string, concept: string): PlayerCharacter {
  return makePc({
    name,
    notes: concept || '',
  });
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

  const finalMode = patch.mode ?? (patch.soloMode === true ? 'duet' : 'standard');
  next.mode = finalMode;
  next.__soloMode = finalMode === 'solo' || finalMode === 'duet';
  next.modeMigratedAt = Date.now();

  if (patch.pitch) next.pitch = patch.pitch;

  if (patch.truths && patch.truths.length > 0) {
    const existing = Array.isArray(base.gWorld) ? (base.gWorld as string[]) : [];
    next.gWorld = [...existing, ...patch.truths];
  }

  const isSoloOrDuet = finalMode === 'solo' || finalMode === 'duet';
  if (isSoloOrDuet) {
    if (patch.pc) {
      const existingPcs = Array.isArray(base.pcs) ? (base.pcs as PlayerCharacter[]) : [];
      const newPc = makeWizardFirstClassPC(patch.pc.name, patch.pc.concept);
      // In duet mode, mark the protagonist as player-owned. In solo, marked as dm-owned.
      newPc.ownership = {
        ownerType: finalMode === 'duet' ? 'player' : 'dm',
      };
      next.pcs = [...existingPcs, newPc];
      if (patch.pc.goal) {
        const existingGoals = Array.isArray(base.pcGoals) ? (base.pcGoals as any[]) : [];
        next.pcGoals = [...existingGoals, { text: patch.pc.goal, timeframe: 'short', success: '', failure: '', linked: '' }];
      }
    }
  } else if (patch.pcs && patch.pcs.length > 0) {
    const existingPcs = Array.isArray(base.pcs) ? (base.pcs as PlayerCharacter[]) : [];
    const newPcs = patch.pcs.map((p) => {
      const pc = makeWizardFirstClassPC(p.name, p.concept || '');
      pc.ownership = {
        ownerType: 'player',
      };
      return pc;
    });
    next.pcs = [...existingPcs, ...newPcs];

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
