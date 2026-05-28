// Pure mapper from the PlayerCharacter schema to the legacy Character shape,
// extracted verbatim from CampaignEditor.tsx. Used to feed PC data into views
// that still consume the legacy Character type.
import { type Character, emptyCharacter } from '@/lib/character-schema';
import { type PlayerCharacter } from '@/lib/pc/types';

export function mapPcToLegacyCharacter(pc: PlayerCharacter): Character {
  const base = emptyCharacter();
  const classStr = pc.classes.map(c => `${c.name} ${c.level}${c.subclass ? ` (${c.subclass})` : ''}`).join(' / ');
  const abilities = {
    str: String(pc.abilities.STR),
    dex: String(pc.abilities.DEX),
    con: String(pc.abilities.CON),
    int: String(pc.abilities.INT),
    wis: String(pc.abilities.WIS),
    cha: String(pc.abilities.CHA),
  };
  return {
    ...base,
    id: pc.id,
    name: pc.name,
    race: pc.race,
    classLevel: classStr,
    background: pc.background,
    alignment: pc.alignment || '',
    abilities,
    ac: String(pc.ac),
    hp: String(pc.hp.current),
    hpMax: String(pc.hp.max),
    initiative: String(pc.initiativeMod >= 0 ? `+${pc.initiativeMod}` : pc.initiativeMod),
    speed: String(pc.speed),
    languages: pc.proficiencies.languages.join(', '),
    proficiencies: [
      ...pc.proficiencies.armor.map(x => `Armor: ${x}`),
      ...pc.proficiencies.weapons.map(x => `Weapon: ${x}`),
      ...pc.proficiencies.tools.map(x => `Tool: ${x}`),
    ].join(', '),
    saves: pc.proficiencies.savingThrows.join(', '),
    skills: pc.proficiencies.skills.join(', '),
    attacks: pc.attacks.map(a => ({
      name: a.name,
      bonus: String(a.attackBonus >= 0 ? `+${a.attackBonus}` : a.attackBonus),
      damage: a.damageExpr,
      notes: a.notes || '',
    })),
    equipment: pc.inventory.map(i => `${i.name}${i.qty > 1 ? ` x${i.qty}` : ''}`).join('\n'),
    features: pc.features.map(f => f.name).join('\n'),
    notes: pc.notes,
    ownership: pc.ownership ? {
      ownerType: pc.ownership.ownerType,
      playerSlotId: pc.ownership.playerSlotId,
    } : undefined,
  };
}
