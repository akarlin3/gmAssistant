// Curated library of opening hooks for Lazy DM step 2 — "Create a Strong
// Start". Each entry drops the party into the middle of an unresolved
// moment, leaving the specifics (names, locations, system) to the DM.

export type StrongStartCategory =
  | 'combat'
  | 'mystery'
  | 'arrival'
  | 'ultimatum'
  | 'discovery'
  | 'social'
  | 'environmental';

export type StrongStart = {
  id: string;
  category: StrongStartCategory;
  title: string;
  body: string;
};

export const CATEGORY_LABELS: Record<StrongStartCategory, string> = {
  combat: 'Combat',
  mystery: 'Mystery',
  arrival: 'Arrival',
  ultimatum: 'Ultimatum',
  discovery: 'Discovery',
  social: 'Social',
  environmental: 'Environmental',
};

export const STRONG_STARTS: StrongStart[] = [
  // ── Combat ────────────────────────────────────────────────────────
  {
    id: 'combat-bridge-ambush',
    category: 'combat',
    title: 'Ambush on the Bridge',
    body: 'The first arrow nails the wagon driver to his seat before any of you hear the bowstrings. Figures rise from the reeds on either side of the bridge, faces wrapped against the cold. The lead one is already shouting a name — and it is one of yours.',
  },
  {
    id: 'combat-tavern-doors',
    category: 'combat',
    title: 'The Doors Burst Open',
    body: 'You are halfway through your second drink when the tavern doors slam apart and three armed figures stride in dragging a fourth, hooded and limp, between them. The biggest scans the room, lays eyes on you, and says one word: "Out." Tables scrape backward. No one is moving toward the door but them.',
  },
  {
    id: 'combat-rooftop-pursuit',
    category: 'combat',
    title: 'Mid-Pursuit on the Rooftops',
    body: 'You are running. You have been running. The thief is two rooftops ahead and the satchel under their arm is glowing faintly through the leather. A tile cracks under your boot and the alley below tilts sickeningly close — and now there are footsteps behind you, too.',
  },
  {
    id: 'combat-camp-overrun',
    category: 'combat',
    title: 'The Camp Is Burning',
    body: 'You wake to the smell of smoke and a scream cut short. Half the tents are already on fire. Whatever did this is still here — you can hear something heavy dragging through the underbrush at the treeline, and the watch is not at their post.',
  },
  {
    id: 'combat-arena-doors',
    category: 'combat',
    title: 'The Sand Was Not Empty',
    body: 'The crowd above you is roaring before you understand why. You were brought down here to fight one opponent. The gate opposite yours has been open for some time, and whatever came through it is not waiting in the center of the arena like the rules said. It is already behind something — and the something is moving.',
  },

  // ── Mystery ───────────────────────────────────────────────────────
  {
    id: 'mystery-letter-blood',
    category: 'mystery',
    title: 'A Letter, Bloody at the Edges',
    body: 'The courier is dead at your feet. He made it as far as your doorstep before he fell. In his fist is a sealed letter addressed to you in handwriting none of you recognize, and the wax bears a sigil that one of you absolutely does.',
  },
  {
    id: 'mystery-impossible-corpse',
    category: 'mystery',
    title: 'The Body That Should Not Be There',
    body: 'The watch captain pulls back the sheet and waits for one of you to react. The face on the slab is one you all know. The trouble is, you saw her alive less than an hour ago, on the other side of the city, doing something that should not have left her dead in a canal.',
  },
  {
    id: 'mystery-empty-room',
    category: 'mystery',
    title: 'The Sealed Room',
    body: 'The door was bolted from the inside, the windows shuttered and nailed, the chimney sealed. The man you were sent to question is not in the room. Nothing is missing except him — and the chair he was tied to, which is still tied.',
  },
  {
    id: 'mystery-clock-stopped',
    category: 'mystery',
    title: 'Every Clock Stopped at Once',
    body: 'You realize it at the same moment: every clock in the building has stopped. Same time on every face. The candles are still burning. People are still talking. But somewhere down the corridor, very faintly, you hear one clock — exactly one — still ticking.',
  },

  // ── Arrival ───────────────────────────────────────────────────────
  {
    id: 'arrival-town-too-quiet',
    category: 'arrival',
    title: 'The Town That Did Not Greet You',
    body: 'You crest the rise and the town is there exactly as the map said. Smoke from the chimneys, washing on the lines, doors propped open against the heat. There are no people. None at the well. None at the gate. The washing on the line is bone dry and stiff with frost.',
  },
  {
    id: 'arrival-strangers-waiting',
    category: 'arrival',
    title: 'They Were Waiting for You',
    body: 'The inn is full. Every table. Every chair. Every face turns toward you as you push the door open, and a small silence follows. Then the innkeeper smiles and says, "We were starting to worry you would not make it." None of you have ever been here before.',
  },
  {
    id: 'arrival-ship-empty-dock',
    category: 'arrival',
    title: 'Made Port in the Wrong Harbor',
    body: 'The storm broke at dawn and the ship limped into a harbor none of the crew recognized. The dock master is already shouting at the captain in a language none of you speak. He keeps pointing at your flag. His soldiers are unshouldering their weapons very slowly, the way people do when they hope they will not have to use them.',
  },
  {
    id: 'arrival-gate-closed',
    category: 'arrival',
    title: 'The Gates Were Closed for You',
    body: 'The city gates are shut and the guards on the wall are nocking arrows. One of them calls down a name and waits to see who flinches. The road behind you is empty for miles, and the sun is going down.',
  },

  // ── Ultimatum ─────────────────────────────────────────────────────
  {
    id: 'ultimatum-hostage-bell',
    category: 'ultimatum',
    title: 'Before the Bell Tolls',
    body: 'The figure on the platform raises a knife to the hostage\'s throat and shouts your names — every one of you, in order. "When the next bell tolls, they die. Unless you bring me what you took." None of you have taken anything. The bell is fifty feet behind you, and the hour is almost up.',
  },
  {
    id: 'ultimatum-poison',
    category: 'ultimatum',
    title: 'You Have Already Been Poisoned',
    body: 'The wine was excellent. You all complimented your host on it. He smiles now, sets down his own untouched glass, and tells you exactly how long you have to do exactly what he wants. The antidote, he assures you, is in a place where you can certainly reach it — if you hurry.',
  },
  {
    id: 'ultimatum-burning-fuse',
    category: 'ultimatum',
    title: 'The Fuse Is Already Lit',
    body: 'You find the powder kegs in the cellar a heartbeat before you smell the smoke. The fuse is short and lit and disappearing into a hole in the wall toward the rest of the building — a building presently full of people who have no idea anything is wrong.',
  },
  {
    id: 'ultimatum-tribute',
    category: 'ultimatum',
    title: 'The Tribute Is Late',
    body: 'The thing in the cave will not wait much longer. You can see the village elders down on the road, weeping, dragging the cart back toward the cave because they could not gather enough. The cart is half full. The sun is almost down. Whatever is in the cave has started to call its terms — and it knows your names now.',
  },

  // ── Discovery ─────────────────────────────────────────────────────
  {
    id: 'discovery-map-floor',
    category: 'discovery',
    title: 'The Map Beneath the Floor',
    body: 'The floorboard cracks under one of you and reveals a hollow. Inside is a map drawn on hide, folded small, and stained dark at one corner. It shows this room, this house, and a route leading out of the city to a place that should not exist. Someone has marked the route in fresh ink, very recently.',
  },
  {
    id: 'discovery-living-statue',
    category: 'discovery',
    title: 'The Statue Was Breathing',
    body: 'You almost walked past it. It is the smallest statue in the gallery, set in a niche between two larger ones, and it is breathing. Slowly. Once every dozen heartbeats. Its eyes are closed. Its hand is curled around something none of you can quite see.',
  },
  {
    id: 'discovery-letter-yourself',
    category: 'discovery',
    title: 'A Letter to Yourself',
    body: 'The letter is on the table where you all sat down to eat. The handwriting on the outside is — without question — one of yours. The inside begins, "If you are reading this, then it has already gone wrong. Do not trust the one who hands you this paper."',
  },
  {
    id: 'discovery-second-door',
    category: 'discovery',
    title: 'The Door That Was Not There Yesterday',
    body: 'You return to a place all of you know — a familiar wall, in a familiar room. The wall has a door in it now. Old wood. Iron hinges. A keyhole. Everyone in the building swears the door has always been there.',
  },

  // ── Social ────────────────────────────────────────────────────────
  {
    id: 'social-wedding-toast',
    category: 'social',
    title: 'A Toast at the Wedding',
    body: 'You were not on the guest list, but here you are, glasses raised. The host is finishing a toast naming each of you by deed and by debt. The hall is silent. Every eye in the room is on you. The host smiles, sets down the glass, and says, "Now, friends. To business."',
  },
  {
    id: 'social-trial',
    category: 'social',
    title: 'Called as Witnesses',
    body: 'You did not know there was a trial. You did not know you were witnesses. You certainly did not know whose. The accused, in chains across the room, looks up when your names are called and laughs — once — and stops laughing very quickly.',
  },
  {
    id: 'social-debt-collector',
    category: 'social',
    title: 'A Debt Comes Due',
    body: 'The well-dressed stranger sets a small ledger on the table between you. They tap one line of it, very politely. "This debt has changed hands. I now hold it. I am here to collect — tonight." None of you remember the debt. The signature on the line, however, is unmistakably one of yours.',
  },
  {
    id: 'social-imposter',
    category: 'social',
    title: 'Someone Is Wearing Your Face',
    body: 'The town watch arrests one of you on sight as you enter the market. They are not mistaken — the face on the warrant is yours, the deeds are detailed, and the witnesses are already pointing. Behind you, half a street away, you see someone else wearing your face, turning a corner.',
  },

  // ── Environmental ────────────────────────────────────────────────
  {
    id: 'environmental-river-rising',
    category: 'environmental',
    title: 'The River Is Climbing the Walls',
    body: 'You wake to water lapping at the foot of your bedroll. The river that ran below the bluff last night is now running through the camp. It is rising visibly — finger-widths every minute — and the only path back to high ground is the way you came.',
  },
  {
    id: 'environmental-ash-falling',
    category: 'environmental',
    title: 'It Is Snowing Ash',
    body: 'It is the wrong season for snow. The flakes are gray, and they leave a smear on your sleeve when you brush them off. People in the street are looking up, then north, then beginning, very calmly, to pack.',
  },
  {
    id: 'environmental-cave-collapse',
    category: 'environmental',
    title: 'The Roof Is Coming Down',
    body: 'The first stone falls between you, the size of a fist, and shatters. A second follows. Dust sifts down. Someone in the back of the chamber says, "It is going to go," and the lanterns above start to swing.',
  },
  {
    id: 'environmental-fog-faces',
    category: 'environmental',
    title: 'There Are Faces in the Fog',
    body: 'The fog rolled in too fast and stopped, very precisely, at the edge of the road. When you turn to look back the way you came, the road is gone. And there are — you each see them differently — faces in the gray, none of them strangers.',
  },
  {
    id: 'environmental-tide-wrong',
    category: 'environmental',
    title: 'The Tide Is Going the Wrong Way',
    body: 'The fishermen on the dock are arguing. The tide is going out, but it is going out in the wrong direction — not toward the sea, which is just over the seawall, but inland, up the river, against the current. Boats are beginning to drift the wrong way.',
  },
];

export function rollStrongStart(category?: StrongStartCategory): StrongStart {
  const pool = category
    ? STRONG_STARTS.filter(s => s.category === category)
    : STRONG_STARTS;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function categoryCounts(): Record<StrongStartCategory, number> {
  const acc = {
    combat: 0, mystery: 0, arrival: 0, ultimatum: 0,
    discovery: 0, social: 0, environmental: 0,
  } as Record<StrongStartCategory, number>;
  for (const s of STRONG_STARTS) acc[s.category]++;
  return acc;
}
