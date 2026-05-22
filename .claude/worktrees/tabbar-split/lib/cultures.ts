export const CULTURE_GROUPS: Array<{ label: string; cultures: string[] }> = [
  {
    label: 'Western European',
    cultures: ['English', 'Celtic / Irish', 'Scottish', 'Welsh', 'Norse / Viking', 'French', 'Germanic', 'Dutch / Flemish'],
  },
  {
    label: 'Mediterranean & Classical',
    cultures: ['Italian', 'Spanish', 'Portuguese', 'Greek', 'Roman / Latin', 'Byzantine'],
  },
  {
    label: 'Eastern European',
    cultures: ['Slavic / Russian', 'Polish', 'Hungarian', 'Romanian'],
  },
  {
    label: 'Middle Eastern & North African',
    cultures: ['Arabic', 'Persian', 'Hebrew', 'Egyptian', 'Turkish / Ottoman', 'Berber'],
  },
  {
    label: 'Asian',
    cultures: ['Indian', 'Chinese', 'Japanese', 'Korean', 'Mongolian', 'Tibetan', 'Thai / Southeast Asian'],
  },
  {
    label: 'African',
    cultures: ['West African', 'Ethiopian / Horn of Africa', 'Swahili / East African', 'Zulu / Southern African'],
  },
  {
    label: 'Americas & Pacific',
    cultures: ['Polynesian', 'Native American (Plains)', 'Native American (Pueblo)', 'Mesoamerican / Aztec', 'Inca / Andean', 'Inuit'],
  },
  {
    label: 'Fantasy Races',
    cultures: ['Elven (High)', 'Elven (Wood)', 'Drow', 'Dwarven', 'Halfling', 'Gnomish', 'Orcish', 'Half-Orc', 'Goblin', 'Tiefling (Virtue)', 'Dragonborn', 'Genasi'],
  },
];

export const ALL_CULTURES = CULTURE_GROUPS.flatMap((g) => g.cultures);
