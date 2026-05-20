// Templates and context-gathering for the Vivify tab.
// Each template defines which campaign data slices to include when calling Claude.

export type CampaignData = Record<string, any>;

export type Template = {
  id: string;
  label: string;
  inputPlaceholder: string;
  hint: string;
  contextKeys: string[];
  taskInstruction: string;
};

export const TEMPLATES: Template[] = [
  {
    id: 'describe_place',
    label: 'Describe a Place',
    inputPlaceholder: 'e.g. the tavern in Brindlemark; the cave entrance; the throne room at dusk',
    hint: 'A vivid sensory description grounded in your campaign\'s tone and setting.',
    contextKeys: ['genre', 'tone', 'facts', 'gWorld', 'locations'],
    taskInstruction:
      'Write a vivid, sensory description of the location the user names. Use sight, sound, smell, and texture. Keep it 4-7 sentences. Match the tone of the campaign. If the place is one of the existing locations in the campaign data, incorporate its aspects.',
  },
  {
    id: 'describe_npc',
    label: 'Flesh Out an NPC',
    inputPlaceholder: 'e.g. the dwarven smith Brann; the woman who runs the inn',
    hint: 'Adds physical presence, mannerism, and conversational texture.',
    contextKeys: ['genre', 'tone', 'factions', 'npcs', 'characters'],
    taskInstruction:
      'Flesh out the named NPC into a vivid sketch. Cover appearance (one distinctive detail), one mannerism, how they speak, and what their attitude is on first meeting the PCs. 4-6 sentences. If the NPC exists in the campaign data, build on what\'s already there rather than contradicting it.',
  },
  {
    id: 'narrate_scene',
    label: 'Narrate a Scene Opening',
    inputPlaceholder: 'e.g. the party enters the temple; the chase through the market begins',
    hint: 'A short opening narration to read aloud or use as session prose.',
    contextKeys: ['genre', 'tone', 'characters', 'strongStart'],
    taskInstruction:
      'Write a brief, in-the-moment narration opening this scene from the PCs\' point of view. Present tense, second person ("you"). Set the immediate sensory context, hint at what\'s about to happen, end on a beat that invites a player action. 3-5 sentences.',
  },
  {
    id: 'rumor',
    label: 'Invent a Rumor',
    inputPlaceholder: 'e.g. about the dragon under the keep; about the missing baker',
    hint: 'A piece of in-world gossip that PCs might overhear.',
    contextKeys: ['genre', 'tone', 'factions', 'conflicts'],
    taskInstruction:
      'Write a single rumor as it would be spoken by a local. Make it feel like overheard speech — partial, gossipy, maybe slightly wrong. 1-3 sentences. Identify the speaker in one short phrase before the quote.',
  },
  {
    id: 'continue_scene',
    label: 'Continue a Scene',
    inputPlaceholder: 'Paste the last few sentences of your current scene; describe what happens next',
    hint: 'Continues from where you left off, in the same prose voice.',
    contextKeys: ['genre', 'tone', 'characters', 'sessionLogs'],
    taskInstruction:
      'Continue the scene from where the user left off. Match their prose voice and tense. Move the action forward without resolving the scene yourself — leave room for the PCs to choose. 3-6 sentences.',
  },
  {
    id: 'aftermath',
    label: 'Describe an Aftermath',
    inputPlaceholder: 'e.g. after the battle in the courtyard; after the noble\'s funeral',
    hint: 'The hush after the moment. Sensory and slightly slowed.',
    contextKeys: ['genre', 'tone', 'characters', 'sessionLogs'],
    taskInstruction:
      'Describe the aftermath of the event the user names. Focus on what\'s left behind — sensory detail, what the PCs notice in the silence, what they\'re thinking. Present tense, second person. 3-5 sentences.',
  },
  {
    id: 'flavor_item',
    label: 'Flavor a Magic Item',
    inputPlaceholder: 'e.g. the silver dagger; the ring you mentioned; a +1 sword from the kobold',
    hint: 'Turns mechanics into a thing the PC actually wants to hold.',
    contextKeys: ['genre', 'tone', 'items', 'characters'],
    taskInstruction:
      'Describe this magic item as the PC first encounters it. Physical detail, what it feels like in the hand, what it does in sensory terms (not mechanical terms). 3-5 sentences. Don\'t restate the mechanical effect — translate it into experience.',
  },
  {
    id: 'foreshadow',
    label: 'Foreshadow Something',
    inputPlaceholder: 'e.g. that the villain is closer than the party thinks; that the patron is lying',
    hint: 'A small detail the PC notices that they\'ll later realize meant something.',
    contextKeys: ['genre', 'tone', 'factions', 'secrets'],
    taskInstruction:
      'Invent a single small detail — a sensory cue, an overheard word, a thing slightly out of place — that the PCs might notice now and reinterpret later. Don\'t make it heavy-handed. Don\'t spell out what it means. 1-3 sentences.',
  },
  {
    id: 'freeform',
    label: 'Free-form',
    inputPlaceholder: 'Tell Claude what you want. Anything goes.',
    hint: 'No template. Just your instruction plus full campaign context.',
    contextKeys: [
      'genre', 'tone', 'facts', 'gWorld', 'factions', 'conflicts',
      'npcs', 'locations', 'items', 'secrets', 'characters', 'sessionLogs',
    ],
    taskInstruction:
      'Respond to the user\'s request below using the campaign context provided. Match the tone of the campaign as established in the genre statement and setting facts.',
  },
];

const TITLE_MAP: Record<string, string> = {
  genre: 'Genre Statement',
  tone: 'Tone Keywords',
  facts: 'Setting Facts',
  gWorld: 'World Facts (Givens)',
  factions: 'Factions',
  conflicts: 'Active Conflicts',
  npcs: 'Known NPCs',
  locations: 'Known Locations',
  items: 'Magic Items in Play',
  secrets: 'Active Secrets & Clues',
  characters: 'Player Characters',
  sessionLogs: 'Recent Session Log',
  strongStart: 'Tonight\'s Strong Start',
};

function describeCharacter(c: any): string | null {
  if (!c || typeof c !== 'object') return null;
  const name = c.name?.trim();
  if (!name) return null;
  const parts: string[] = [];
  if (c.classLevel) parts.push(c.classLevel);
  if (c.race) parts.push(c.race);
  if (c.background) parts.push(c.background);
  const heading = parts.length ? `${name} — ${parts.join(', ')}` : name;
  const extras: string[] = [];
  if (c.ideals?.trim()) extras.push(`Wants: ${c.ideals.trim()}`);
  if (c.flaws?.trim()) extras.push(`Fears/flaws: ${c.flaws.trim()}`);
  if (c.bonds?.trim()) extras.push(`Bonds: ${c.bonds.trim()}`);
  return extras.length ? `${heading} (${extras.join(' · ')})` : heading;
}

function describeSessionLog(log: any): string | null {
  if (!log || typeof log !== 'object') return null;
  const body = log.body?.trim();
  if (!body) return null;
  const head = log.title?.trim() || 'Session';
  const date = log.date ? ` (${log.date})` : '';
  return `### ${head}${date}\n${body}`;
}

function describeListEntry(entry: any): string | null {
  if (typeof entry === 'string') return entry.trim() ? `- ${entry}` : null;
  if (entry && typeof entry === 'object') {
    if (entry.name && entry.identity) return `- ${entry.name}: ${entry.identity}`;
    if (entry.name && entry.archetype) return `- ${entry.name} (${entry.archetype})`;
    if (entry.name) return `- ${entry.name}`;
    if (entry.text) return `- ${entry.text}`;
  }
  return null;
}

function formatContextSection(key: string, value: any): string | null {
  if (value === undefined || value === null) return null;
  const title = TITLE_MAP[key] ?? key;

  if (key === 'characters' && Array.isArray(value)) {
    const lines = value.map(describeCharacter).filter((x): x is string => !!x);
    return lines.length ? `## ${title}\n${lines.map(l => `- ${l}`).join('\n')}` : null;
  }

  if (key === 'sessionLogs' && Array.isArray(value)) {
    const sorted = [...value].sort((a, b) => (b?.date || '').localeCompare(a?.date || ''));
    const recent = sorted.slice(0, 2).map(describeSessionLog).filter((x): x is string => !!x);
    return recent.length ? `## ${title}\n\n${recent.join('\n\n')}` : null;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const lines = value.map(describeListEntry).filter((x): x is string => !!x);
    return lines.length ? `## ${title}\n${lines.join('\n')}` : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? `## ${title}\n${trimmed}` : null;
  }

  return null;
}

export function buildSystemPrompt(template: Template, data: CampaignData): string {
  const sections: string[] = [];

  sections.push(
    'You are a writing partner for a tabletop RPG game master. Your job is to produce vivid, evocative prose that the GM can use directly at their table.',
  );

  sections.push(`# Your task\n${template.taskInstruction}`);

  sections.push(
    '# Style rules\n' +
      '- Be specific, not abstract. Concrete sensory detail beats lofty language.\n' +
      '- Don\'t pad. Cut anything that doesn\'t add image, sound, smell, texture, or feeling.\n' +
      '- Don\'t restate the user\'s input or the campaign context. Use them.\n' +
      '- Don\'t include headers, bullet points, or preambles like "Here\'s a description". Just write the prose.\n' +
      '- Match the campaign\'s tone. If the genre is grim, don\'t make it whimsical. If the tone is hopeful, don\'t tip into despair.\n' +
      '- If the campaign data is sparse, use defaults that feel like classic fantasy unless the user\'s input suggests otherwise.',
  );

  const contextSections = template.contextKeys
    .map((key) => formatContextSection(key, data[key]))
    .filter((x): x is string => !!x);

  if (contextSections.length > 0) {
    sections.push(`# Campaign context\n\n${contextSections.join('\n\n')}`);
  } else {
    sections.push(
      '# Campaign context\n\n(No campaign context provided yet — write generically, leaning toward classic fantasy unless the user\'s input suggests otherwise.)',
    );
  }

  return sections.join('\n\n');
}
