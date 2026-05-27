// Appendix F — Markdown export for a finished (or in-progress) scene. Pure:
// callers pass name-lookup maps so this has no dependency on campaign shapes.

import type { SceneEntry, SceneTurn } from './types';

export type SceneExportNames = {
  locationName: (id: string) => string;
  npcName: (id: string) => string;
};

function fmtDate(ms: number | undefined): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString();
}

function turnToMarkdown(turn: SceneTurn, index: number, names: SceneExportNames): string {
  const lines: string[] = [];
  lines.push(`## Turn ${index + 1}`);
  lines.push('');
  lines.push(`> **PC:** ${turn.pcAction}`);
  lines.push('');
  lines.push(turn.response.sensory);
  lines.push('');
  if (turn.response.dialogue.length > 0) {
    lines.push('**Dialogue:**');
    for (const d of turn.response.dialogue) {
      lines.push(`- *${names.npcName(d.npcId)}:* "${d.line}"`);
    }
    lines.push('');
  }
  const roll = turn.response.suggestedRoll;
  if (roll) {
    const skill = roll.skill ? ` (${roll.skill})` : '';
    lines.push(`**Suggested roll:** ${roll.ability}${skill} DC ${roll.dc} — ${roll.reason}`);
  }
  if (turn.rolled) {
    const verdict =
      turn.rolled.success === null ? '—' : turn.rolled.success ? 'SUCCESS' : 'FAILURE';
    lines.push(`**Rolled:** ${turn.rolled.expr} = ${turn.rolled.result} (${verdict})`);
  }
  if (turn.outcome?.trim()) {
    lines.push(`**Outcome:** ${turn.outcome.trim()}`);
  }
  return lines.join('\n');
}

export function sceneToMarkdown(scene: SceneEntry, names: SceneExportNames): string {
  const locationName = names.locationName(scene.locationId);
  const npcNames = scene.presentNpcIds.map((id) => names.npcName(id)).join(', ');

  const parts: string[] = [];
  parts.push(`# Scene at ${locationName}`);
  parts.push('');
  parts.push(`**Started:** ${fmtDate(scene.startedAt)}`);
  parts.push(`**Ended:** ${fmtDate(scene.endedAt)}`);
  parts.push('');
  parts.push(`**Present:** ${npcNames || '—'}`);
  parts.push('');
  parts.push(`**Party state at start:** ${scene.partyState || '—'}`);
  parts.push('');
  parts.push('---');
  parts.push('');
  parts.push(scene.turns.map((t, i) => turnToMarkdown(t, i, names)).join('\n\n---\n\n'));
  if (scene.summary?.trim()) {
    parts.push('');
    parts.push('---');
    parts.push('');
    parts.push('## Summary');
    parts.push('');
    parts.push(scene.summary.trim());
  }
  return parts.join('\n');
}
