// Markdown export of a PC sheet (Appendix G layout).

import { abilityMod, formatMod, pcInitiative } from './derived';
import { savingThrowModifier, skillModifier, SKILL_NAMES } from './skills';
import { ABILITY_NAMES, SPELL_SLOT_LEVELS, type PlayerCharacter } from './types';

function formatClasses(pc: PlayerCharacter): string {
  if (!pc.classes.length) return '';
  return pc.classes
    .map((c) => `${c.name} ${c.level}${c.subclass ? ` (${c.subclass})` : ''}`)
    .join(' / ');
}

export function pcToMarkdown(pc: PlayerCharacter): string {
  const lines: string[] = [];
  const classes = formatClasses(pc);

  lines.push(`# ${pc.name || 'Unnamed'}`);
  const subtitleBits = [
    [pc.race, classes].filter(Boolean).join(' '),
    `Level ${pc.level}`,
    pc.background,
  ].filter(Boolean);
  lines.push(`**${subtitleBits.join('** · ')}**`);
  lines.push('');

  lines.push('## Abilities');
  lines.push('| STR | DEX | CON | INT | WIS | CHA |');
  lines.push('|----:|----:|----:|----:|----:|----:|');
  lines.push(
    '| ' +
      ABILITY_NAMES.map(
        (a) => `${pc.abilities[a]} (${formatMod(abilityMod(pc.abilities[a]))})`,
      ).join(' | ') +
      ' |',
  );
  lines.push('');
  lines.push(
    `**AC:** ${pc.ac}  **HP:** ${pc.hp.current}/${pc.hp.max} (temp ${pc.hp.temp})  **Speed:** ${pc.speed}`,
  );
  lines.push(
    `**Initiative:** ${formatMod(pcInitiative(pc))}  **Proficiency Bonus:** ${formatMod(pc.proficiencyBonus)}`,
  );
  lines.push('');

  lines.push('## Proficiencies');
  const saves = ABILITY_NAMES.filter((a) =>
    pc.proficiencies.savingThrows.includes(a),
  )
    .map((a) => `${a} ${formatMod(savingThrowModifier(pc, a))}`)
    .join(', ');
  const skills = SKILL_NAMES.filter((s) => pc.proficiencies.skills.includes(s))
    .map((s) => `${s} ${formatMod(skillModifier(pc, s))}`)
    .join(', ');
  lines.push(`- **Saves:** ${saves || '—'}`);
  lines.push(`- **Skills:** ${skills || '—'}`);
  if (pc.proficiencies.languages.length) {
    lines.push(`- **Languages:** ${pc.proficiencies.languages.join(', ')}`);
  }
  lines.push('');

  if (pc.attacks.length) {
    lines.push('## Attacks');
    lines.push('| Name | Bonus | Damage | Range |');
    lines.push('|------|------:|--------|-------|');
    for (const a of pc.attacks) {
      lines.push(
        `| ${a.name} | ${formatMod(a.attackBonus)} | ${a.damageExpr}${a.damageType ? ` ${a.damageType}` : ''} | ${a.range || '—'} |`,
      );
    }
    lines.push('');
  }

  if (pc.spellSlots && Object.keys(pc.spellSlots).length) {
    lines.push('## Spell Slots');
    for (const lvl of SPELL_SLOT_LEVELS) {
      const slot = pc.spellSlots[lvl];
      if (slot && slot.max > 0) {
        lines.push(`- **Level ${lvl}:** ${slot.max - slot.used}/${slot.max}`);
      }
    }
    if (pc.spellsKnown && pc.spellsKnown.length) {
      lines.push('');
      lines.push(`**Spells Known:** ${pc.spellsKnown.join(', ')}`);
    }
    lines.push('');
  }

  if (pc.inventory.length) {
    lines.push('## Inventory');
    for (const it of pc.inventory) {
      const qty = it.qty !== 1 ? ` ×${it.qty}` : '';
      const eq = it.equipped ? ' *(equipped)*' : '';
      lines.push(`- ${it.name}${qty}${eq}`);
    }
    lines.push('');
  }

  if (pc.features.length) {
    lines.push('## Features');
    for (const f of pc.features) {
      const src = f.source ? ` _(${f.source})_` : '';
      const uses = f.uses ? ` — ${f.uses.max - f.uses.used}/${f.uses.max} uses` : '';
      lines.push(`- **${f.name}**${src}${uses}`);
      if (f.description) lines.push(`  ${f.description}`);
    }
    lines.push('');
  }

  if (pc.notes && pc.notes.trim()) {
    lines.push('## Notes');
    lines.push(pc.notes);
    lines.push('');
  }

  const fourLists: Array<[string, string[]]> = [
    ['Goals', pc.goals],
    ['Bonds', pc.bonds],
    ['Ideals', pc.ideals],
    ['Flaws', pc.flaws],
  ];
  if (fourLists.some(([, l]) => l.length)) {
    lines.push('## Goals / Bonds / Ideals / Flaws');
    for (const [label, list] of fourLists) {
      if (list.length) {
        lines.push(`**${label}:**`);
        for (const item of list) lines.push(`- ${item}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
