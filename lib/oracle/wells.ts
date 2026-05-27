// The Wells Oracle — an original yes/no/and/but answer engine for solo and
// at-the-table improvisation. It is inspired by the *style* of Mythic-GME
// emergent play (a chaos factor that bends the odds, doubles that fire random
// events) but uses an ORIGINAL probability curve and ORIGINAL d100 event
// tables — none of Mythic's copyrighted Fate Chart numbers are reproduced.
//
// Pure + deterministic given Math.random; everything here is unit-tested in
// ./wells.test.ts against the probability ranges documented inline.

export type OracleOdds =
  | 'Certain'
  | 'NearlyCertain'
  | 'VeryLikely'
  | 'Likely'
  | 'FiftyFifty'
  | 'Unlikely'
  | 'VeryUnlikely'
  | 'NearlyImpossible'
  | 'Impossible';

export type OracleResult =
  | 'Exceptional Yes'
  | 'Yes, And'
  | 'Yes'
  | 'Yes, But'
  | 'No, But'
  | 'No'
  | 'No, And'
  | 'Exceptional No';

export type RandomEvent = { focus: string; action: string; subject: string };

export type OracleRoll = {
  id: string;
  question: string;
  odds: OracleOdds;
  chaosFactor: number; // 1-9
  roll: number; // 1-100
  threshold: number; // computed yes-threshold (5-95)
  result: OracleResult;
  randomEvent?: RandomEvent;
  timestamp: number;
};

// Display order + human labels for the nine odds levels (UI dropdown order).
export const ODDS_OPTIONS: ReadonlyArray<{ value: OracleOdds; label: string }> = [
  { value: 'Certain', label: 'Certain' },
  { value: 'NearlyCertain', label: 'Nearly Certain' },
  { value: 'VeryLikely', label: 'Very Likely' },
  { value: 'Likely', label: 'Likely' },
  { value: 'FiftyFifty', label: 'Fifty / Fifty' },
  { value: 'Unlikely', label: 'Unlikely' },
  { value: 'VeryUnlikely', label: 'Very Unlikely' },
  { value: 'NearlyImpossible', label: 'Nearly Impossible' },
  { value: 'Impossible', label: 'Impossible' },
];

// Base yes-threshold (out of 100) for each odds level at the neutral chaos
// factor of 5. Higher = more likely "Yes".
export const ODDS_TABLE: Record<OracleOdds, number> = {
  Certain: 90,
  NearlyCertain: 80,
  VeryLikely: 70,
  Likely: 60,
  FiftyFifty: 50,
  Unlikely: 40,
  VeryUnlikely: 30,
  NearlyImpossible: 20,
  Impossible: 10,
};

// Chaos shifts the threshold: a calm world (low chaos) resists the PCs'
// hopes, a chaotic one bends toward "yes". Symmetric around the neutral 5.
export const CHAOS_SHIFT: Record<number, number> = {
  1: -15,
  2: -10,
  3: -5,
  4: -2,
  5: 0,
  6: 2,
  7: 5,
  8: 10,
  9: 15,
};

export function makeOracleId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `oracle-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Clamp the final yes-threshold so even "Impossible" leaves a sliver of hope
// and even "Certain" keeps a sliver of doubt.
export function oracleThreshold(odds: OracleOdds, chaosFactor: number): number {
  const base = ODDS_TABLE[odds];
  const shift = CHAOS_SHIFT[chaosFactor] ?? 0;
  return Math.max(5, Math.min(95, base + shift));
}

export function askOracle(args: {
  question: string;
  odds: OracleOdds;
  chaosFactor: number;
}): Omit<OracleRoll, 'id' | 'timestamp'> {
  const roll = 1 + Math.floor(Math.random() * 100);
  const threshold = oracleThreshold(args.odds, args.chaosFactor);
  const isYes = roll <= threshold;

  let result: OracleResult;
  if (isYes) {
    // 0 = strongest yes (low roll), 1 = weakest yes (roll == threshold).
    const pos = roll / threshold;
    if (pos <= 0.1) result = 'Exceptional Yes';
    else if (pos <= 0.4) result = 'Yes, And';
    else if (pos >= 0.85) result = 'Yes, But';
    else result = 'Yes';
  } else {
    // 0 = barely no (just over threshold), 1 = strongest no (roll == 100).
    const pos = (roll - threshold) / (100 - threshold);
    if (pos >= 0.9) result = 'Exceptional No';
    else if (pos >= 0.6) result = 'No, And';
    else if (pos <= 0.15) result = 'No, But';
    else result = 'No';
  }

  // Random event fires on matching digits (doubles) whose value is within the
  // chaos factor — e.g. 33 fires at chaos 3+, 88 only at chaos 8+. Higher
  // chaos => events fire more often, exactly as emergent play intends.
  const tens = Math.floor(roll / 10);
  const ones = roll % 10;
  let randomEvent: RandomEvent | undefined;
  if (tens === ones && tens > 0 && tens <= args.chaosFactor) {
    randomEvent = rollRandomEvent();
  }

  return {
    question: args.question,
    odds: args.odds,
    chaosFactor: args.chaosFactor,
    roll,
    threshold,
    result,
    randomEvent,
  };
}

// Convenience wrapper that stamps an id + timestamp so the result can be
// pushed straight onto data.oracleLog.
export function rollOracle(args: {
  question: string;
  odds: OracleOdds;
  chaosFactor: number;
}): OracleRoll {
  return { ...askOracle(args), id: makeOracleId(), timestamp: Date.now() };
}

export function rollRandomEvent(): RandomEvent {
  return {
    focus: FOCUS_TABLE[Math.floor(Math.random() * FOCUS_TABLE.length)],
    action: ACTION_TABLE[Math.floor(Math.random() * ACTION_TABLE.length)],
    subject: SUBJECT_TABLE[Math.floor(Math.random() * SUBJECT_TABLE.length)],
  };
}

export function isYesResult(result: OracleResult): boolean {
  return result.startsWith('Yes') || result === 'Exceptional Yes';
}

// Roll a single scene complication (d100). Pure helper used by the modal's
// "Complicate Scene" button.
export function rollComplication(): { roll: number; complication: string } {
  const idx = Math.floor(Math.random() * COMPLICATION_TABLE.length);
  return { roll: idx + 1, complication: COMPLICATION_TABLE[idx] };
}

// --- Random Event Focus (d20) ----------------------------------------------
export const FOCUS_TABLE: readonly string[] = [
  'NPC Action', // 1
  'NPC Goal Advances', // 2
  'PC Setback', // 3
  'PC Boon', // 4
  'Progress Toward Goal', // 5
  'Setback From Goal', // 6
  'New NPC', // 7
  'Old NPC Returns', // 8
  'Faction Event', // 9
  'Faction Conflict', // 10
  'Location Shifts', // 11
  'Discovery', // 12
  'Complication', // 13
  'Surprise', // 14
  'Echo of the Past', // 15
  'Remote Event (News)', // 16
  'Time Passes', // 17
  'Magic Surfaces', // 18
  'PC Memory Surfaces', // 19
  'Ambiguous', // 20
];

// --- Action (d100) ---------------------------------------------------------
export const ACTION_TABLE: readonly string[] = [
  'Abandon', 'Accept', 'Accuse', 'Acquire', 'Aid', 'Ambush', 'Announce', 'Approach', 'Arrest', 'Arrive',
  'Ask', 'Assault', 'Avoid', 'Bargain', 'Beg', 'Betray', 'Block', 'Bond', 'Break', 'Bribe',
  'Build', 'Burn', 'Buy', 'Capture', 'Celebrate', 'Challenge', 'Change', 'Charge', 'Cheat', 'Choose',
  'Claim', 'Collapse', 'Confess', 'Confront', 'Conspire', 'Construct', 'Consume', 'Corrupt', 'Cure', 'Damage',
  'Deceive', 'Defend', 'Deliver', 'Demand', 'Destroy', 'Disappear', 'Discover', 'Disguise', 'Distract', 'Doubt',
  'Dream', 'Embrace', 'Emerge', 'Escape', 'Expose', 'Fail', 'Fall', 'Fight', 'Find', 'Flee',
  'Forge', 'Forgive', 'Frighten', 'Gather', 'Give', 'Grieve', 'Guard', 'Guide', 'Haunt', 'Heal',
  'Hide', 'Hunt', 'Imprison', 'Inspire', 'Insult', 'Investigate', 'Judge', 'Kill', 'Leave', 'Learn',
  'Lie', 'Locate', 'Lose', 'Move', 'Negotiate', 'Observe', 'Offer', 'Open', 'Plead', 'Possess',
  'Promise', 'Protect', 'Pursue', 'Question', 'Reach', 'Reject', 'Release', 'Remember', 'Repair', 'Reveal',
];

// --- Subject (d100) --------------------------------------------------------
export const SUBJECT_TABLE: readonly string[] = [
  'Allies', 'Ancient Pact', 'Artifact', 'Authority', 'Banner', 'Bargain', 'Beast', 'Belief', 'Betrayal', 'Bone',
  'Boundary', 'Bridge', 'Captive', 'Caravan', 'Child', 'Choice', 'Coin', 'Compass', 'Council', 'Court',
  'Crown', 'Curse', 'Custom', 'Death', 'Debt', 'Decision', 'Deed', 'Demon', 'Disease', 'Doorway',
  'Dream', 'Duel', 'Echo', 'Edge', 'Elder', 'Enemy', 'Family', 'Fate', 'Father', 'Fear',
  'Feast', 'Fire', 'Flag', 'Forest', 'Friend', 'Future', 'Garden', 'Ghost', 'Gift', 'Glass',
  'Gold', 'Grief', 'Guild', 'Harvest', 'Heir', 'Heretic', 'Home', 'Honor', 'Hunger', 'Illness',
  'Innocence', 'Iron', 'Journey', 'Judgment', 'Key', 'Knowledge', 'Law', 'Letter', 'Library', 'Light',
  'Lock', 'Magic', 'Mask', 'Memory', 'Merchant', 'Message', 'Monster', 'Mother', 'Mountain', 'Name',
  'Night', 'Oath', 'Outsider', 'Pact', 'Past', 'Path', 'People', 'Plague', 'Power', 'Prayer',
  'Priest', 'Prison', 'Promise', 'Prophecy', 'Protector', 'Quest', 'Rebel', 'Relic', 'Ring', 'River',
];

// --- Scene Complication (d100) ---------------------------------------------
export const COMPLICATION_TABLE: readonly string[] = [
  'Time pressure: something will happen in N rounds if unresolved', // 1
  'An unexpected witness arrives who could report the characters', // 2
  'Environmental hazard intensifies (fire, flood, extreme cold, extreme heat)', // 3
  'Equipment failure: something vital you rely on breaks or runs out of power', // 4
  'A hidden ally or neutral party reveals themselves with a complicated demand', // 5
  'A hidden enemy or rival reveals their presence or has been watching', // 6
  'An NPC present switches sides, retreats, or betrays a trust', // 7
  'Magic surges briefly — a small, inexplicable, or chaotic magical effect occurs', // 8
  'A resource runs dangerously low (light source, water, ammunition, food)', // 9
  'False information surfaces: something you believed to be true is wrong', // 10
  'An NPC reveals a hidden agenda, secret identity, or conflicting motive', // 11
  'Backup or reinforcement arrives for the antagonist or threat', // 12
  'A previous decision or past mistake returns to complicate the current situation', // 13
  'A civilian, innocent bystander, or vulnerable creature becomes endangered', // 14
  'Architectural or structural failure: floor, ceiling, wall, or bridge begins to give way', // 15
  'Two distinct threats, enemies, or hazards merge into one larger threat', // 16
  'Useful information, a key map, or a critical item is misplaced or stolen', // 17
  'An honor compromise: you must choose between two closely held values or vows', // 18
  'An old debt, promise, or legal obligation is called in at the worst possible moment', // 19
  'An echo from your past arrives in physical form (a token, a letter, a familiar face)', // 20
  'Sudden change in weather (fog, thunderstorm, high winds) makes actions difficult', // 21
  'A key path, doorway, or exit becomes blocked, locked, or guarded', // 22
  'A minor injury or physical strain begins to hinder movement or actions', // 23
  'A misunderstanding arises between allies, sowing seeds of doubt', // 24
  'An item in your possession attracts unwanted attention (monsters, guards, thieves)', // 25
  'A local authority or law enforcer demands explanation or imposes a restriction', // 26
  'A nearby creature or entity goes into a frenzy, panics, or reacts aggressively', // 27
  'A vital tool, key, or device requires a rare or unexpected component to work', // 28
  'The terrain shifts unexpectedly (landslide, collapsing ledge, opening sinkhole)', // 29
  'A character experiences a vivid, distracting flashback or premonition', // 30
  'An active rumor or reputation precedes you, causing locals to react with fear', // 31
  'A magical ward, alarm, or trap is accidentally triggered', // 32
  'An NPC falls ill, is poisoned, or suffers a sudden debilitating condition', // 33
  'A linguistic or cultural barrier makes communication extremely difficult', // 34
  'An item of value is dropped, scattered, or falls into a dangerous spot', // 35
  'The scent of blood, magic, or food attracts local scavengers or predators', // 36
  'A secret door or passage is discovered, but it is trapped or occupied', // 37
  'A piece of lore or history is misremembered, leading you in the wrong direction', // 38
  'An NPC demands a heavy bribe, favor, or exchange before offering any assistance', // 39
  "Your shadow, reflection, or magic behaves strangely, hinting at a presence", // 40
  'A tool or weapon becomes temporarily cursed or magnetically stuck to something', // 41
  'A sudden, unexplained loss of gravity or local atmospheric anomaly occurs', // 42
  'A vital contact is found to be missing, incapacitated, or dead', // 43
  'The passage of time is distorted: hours have passed when it felt like minutes', // 44
  'A local custom or taboo is accidentally violated, causing immediate offense', // 45
  'A strange contagion, curse, or rot is detected on a character or their gear', // 46
  "A faction's symbol or banner is spotted nearby, indicating they claim this area", // 47
  'An explosion, collapse, or loud noise elsewhere draws attention to your location', // 48
  'A key NPC suffers a sudden crisis of faith, confidence, or loyalty', // 49
  'Your pack animal, mount, or vehicle becomes spooked, injured, or runs away', // 50
  'A local spirit, ghost, or spectral presence manifests with an urgent demand', // 51
  'The ambient light source is snuffed out, leaving the area in total darkness', // 52
  'A piece of clothing, armor, or footwear snags or tears, impeding agility', // 53
  'A sudden draft or wind blows away a loose paper, map, or light item', // 54
  'A disguise or cover story is blown by a minor detail you overlooked', // 55
  'A nearby mechanism (elevator, lever, portcullis) jams halfway through operation', // 56
  'An NPC demands that you choose between two competing factions or causes', // 57
  'A wild beast or monster is spotted nearby, nursing young or protecting territory', // 58
  'A sudden, intense headache, hallucination, or psychic static affects a character', // 59
  'An object of historical or religious significance is accidentally damaged', // 60
  'A local shop, tavern, or safe house is closed, boarded up, or has been ransacked', // 61
  "An NPC's pet or companion animal escapes and causes a massive disruption", // 62
  'You must perform an action under the scrutiny of an audience or suspicious crowd', // 63
  'A lock is found to be rusted, melted, or deliberately welded shut', // 64
  "An ally's weapon or spell misfires, causing collateral damage", // 65
  'A bounty or warrant is issued for your arrest, or your likenesses are posted', // 66
  'An NPC attempts to steal from you under the guise of helping', // 67
  'The air becomes thin, toxic, or filled with thick, choking smoke or spores', // 68
  'A magical portal or rift opens slightly, leaking planar energy or entities', // 69
  'A trusted contact is revealed to be working for a rival or enemy', // 70
  'A sudden earthquake, tremor, or vibrations throw everyone off balance', // 71
  'A key component of the environment (a water wheel, steam pipe) begins to overload', // 72
  'An NPC misinterprets your actions as a romantic, hostile, or formal gesture', // 73
  'An ancient, dormant entity stirs or speaks in a long-dead language', // 74
  'A structural collapse reveals a new hazard (flooded chamber, gas pocket)', // 75
  'A spell or ability works too well, causing an excessive, unwanted side effect', // 76
  'A local festival, parade, or riot blocks the streets and sweeps you along', // 77
  'An item bought or acquired recently is revealed to be counterfeit or stolen', // 78
  'A curse or geas is placed upon you, requiring a specific task to lift', // 79
  'An NPC is mistaken for you, drawing a threat intended for you toward them', // 80
  'A sudden swarm of insects, bats, or pests disrupts concentration and visibility', // 81
  'Your footsteps or movements leave highly visible or magical tracks', // 82
  'A piece of technology or magic suffers from electromagnetic or magical interference', // 83
  "An NPC who knows a character's deepest secret or embarrassing past arrives", // 84
  'The water level rises rapidly or a sudden tide comes in, flooding the area', // 85
  'A valuable lead turns out to be a deliberate decoy or trap set by a rival', // 86
  'Your shield, barrier, or defensive item is shattered or disabled', // 87
  'An NPC offers assistance but demands a blood oath or magical contract in return', // 88
  'A sudden, deep fatigue or unnatural exhaustion overcomes the characters', // 89
  'The local flora reacts aggressively: vines constrict or plants release toxins', // 90
  'A key door or chest is protected by a riddle or puzzle that has been altered', // 91
  "An NPC's ghost or spirit appears, blaming you for their demise", // 92
  'A nearby fire spreads rapidly, threatening to cut off the only exit', // 93
  'An item of equipment begins to glow or hum loudly, giving away your location', // 94
  'A rival party of adventurers or treasure hunters arrives with the same goal', // 95
  'A local deity or powerful patron expresses displeasure, imposing a minor omen', // 96
  'A piece of vital information is written in a code or language no one knows', // 97
  'A sudden, overwhelming sense of dread or horror shakes your resolve', // 98
  'A magical mirror, portal, or trap swaps the physical positions of two characters', // 99
  'Ultimate complication: multiple previous complications trigger at once', // 100
];
