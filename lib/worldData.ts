export const WORLD_KEYS = [
  'gWorld', 'gFNL', 'system', 'pitch', 'genre', 'tone', 'lines', 'facts', 'conflicts',
  'factions', 'secrets', 'npcs', 'locations', 'items', 'monsters',
  'homebrewMonsters', 'homebrewSpells', 'traps', 'treasure', 'handouts',
  'factionWorld', 'relationshipGraph', 'generatorLogs', 'vivifyHistory'
] as const;

export const CAMPAIGN_KEYS = [
  'characters', 'pcGoals', 'clocks', 'chases', 'downtime',
  'sessionLogs', 'sessionLogV2', 'scenes', 'campaignEventLog',
  'macros', 'spellFavs', 'logistics', 'strongStart',
  'endCatalyst', 'endReadiness', 'endThreads', 'dropped',
  'auditFactions', 'auditGoals', 'auditSecrets', 'reviewNotes',
  '__activeSessionId', '__sessionStartedAt', '__sessionEndedAt',
  '__sessionScratchpad', '__sessionUsedScenes', '__sessionItemsGiven',
  '__sessionChangeEvents', '__runSessionOpen', '__initiative', '__initiativeOpen',
  '__encounterCalc', '__prepWizardOpen', '__prepWizardStep', 'prepWizardRuns',
  '__archivedDowntimeOpen', 'revSec',
  'worldClock', '__livingWorldBriefingPendingId', '__livingWorldPromptDismissed'
] as const;
