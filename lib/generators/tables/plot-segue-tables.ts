// Curated bank of plot-segue moments — narrative bridges that dangle a new
// plot arc into an active scene (mode: 'pivot') or fall out of recent party
// actions (mode: 'aftermath'). Each entry is tagged with delivery, arcFlavor,
// and urgency so the generator can honor the user's dials and fall back
// progressively when a strict filter has no matches.

import type {
  PlotSegueEntry,
  SegueArcFlavor,
  SegueDelivery,
  SegueMode,
  SegueUrgency,
} from '@/lib/generators/types';

export const SEGUE_MODE_LABELS: Record<SegueMode, string> = {
  pivot: 'Pivot',
  aftermath: 'Aftermath',
};

export const SEGUE_DELIVERY_LABELS: Record<SegueDelivery, string> = {
  messenger: 'Messenger',
  rumor: 'Rumor',
  discovery: 'Discovery',
  environmental: 'Environmental',
  'npc-interrupt': 'NPC interrupts',
};

export const SEGUE_ARC_LABELS: Record<SegueArcFlavor, string> = {
  mystery: 'Mystery',
  threat: 'Threat',
  faction: 'Faction conflict',
  personal: 'Personal',
  wonder: 'Wonder',
};

export const SEGUE_URGENCY_LABELS: Record<SegueUrgency, string> = {
  'slow-burn': 'Slow burn',
  pressing: 'Pressing',
  now: 'Now',
};

export const PLOT_SEGUES: PlotSegueEntry[] = [
  // ── Mystery ────────────────────────────────────────────────────────
  {
    mode: 'pivot', delivery: 'messenger', arcFlavor: 'mystery', urgency: 'slow-burn',
    trigger: 'Mid-conversation, a sealed envelope slides under the door, unaddressed.',
    hook: 'Inside is a single page of ledger entries — names, dates, amounts — and one of the names is yours, written in a hand none of you recognize, dated three years from now. The amount beside it is the largest on the page.',
    arcSeed: 'Someone is keeping books on the party from the future.',
  },
  {
    mode: 'aftermath', delivery: 'discovery', arcFlavor: 'mystery', urgency: 'pressing',
    trigger: 'Sorting through the pockets of the body you just searched, one of you finds a folded paper that was not there a minute ago.',
    hook: 'It is a child\'s drawing of a tower with no doors, with your initials in the bottom corner. The ink is fresh. The body has been cold for hours.',
    arcSeed: 'Someone is leaving the party messages — and they were here, watching.',
  },
  {
    mode: 'pivot', delivery: 'rumor', arcFlavor: 'mystery', urgency: 'slow-burn',
    trigger: 'The tavern keeper pours, then leans in: "You hear the one about Greyford Bridge?"',
    hook: 'Travelers crossing at dawn have started arriving on the wrong side. Same hour, same step count. They swear they walked east. The bridge faces west.',
    arcSeed: 'A nearby crossing has stopped obeying geography.',
  },
  {
    mode: 'pivot', delivery: 'environmental', arcFlavor: 'mystery', urgency: 'slow-burn',
    trigger: 'One of you notices it first: the candles in this room are guttering in a wind none of you can feel.',
    hook: 'Then the next room. Then the corridor. Every flame in the building leans west, very slightly, as if something is breathing in from the other side of the wall.',
    arcSeed: 'Something is pulling at this place from elsewhere — and it is getting stronger.',
  },
  {
    mode: 'pivot', delivery: 'npc-interrupt', arcFlavor: 'mystery', urgency: 'now',
    trigger: 'A child you have never seen tugs at one of your sleeves, urgent.',
    hook: '"You forgot," she says. "You promised her you would come back. She is waiting." She points up an alley you have never been down. When you look back, the child is gone.',
    arcSeed: 'A debt or promise the party does not remember making is being called in.',
  },
  {
    mode: 'aftermath', delivery: 'messenger', arcFlavor: 'mystery', urgency: 'now',
    trigger: 'Before the dust has settled, a small girl appears at the edge of the rubble, holding an envelope.',
    hook: '"He said to give this to whoever was still standing," she says, and points back the way she came. There is no one there. The envelope is addressed to the party by your full names — including the ones you have not used in years.',
    arcSeed: 'An observer was anticipating your survival, and has prepared next steps.',
  },
  {
    mode: 'aftermath', delivery: 'discovery', arcFlavor: 'mystery', urgency: 'slow-burn',
    trigger: 'Cleaning your gear later, you find a feather caught in the strap of your pack.',
    hook: 'It is black, longer than your forearm, and the quill is metallic. None of you saw a bird the whole expedition. The feather is warm. It has been warm since you found it. It has not gotten cooler.',
    arcSeed: 'Something has marked the party for retrieval, and left its calling card.',
  },
  {
    mode: 'pivot', delivery: 'npc-interrupt', arcFlavor: 'mystery', urgency: 'pressing',
    trigger: 'An old man pushes through the crowd toward you.',
    hook: '"You should not be here yet," he hisses. He grabs the nearest PC\'s wrist and turns the palm up. "They wrote the date wrong on you. Do you understand? They wrote it wrong." He looks frightened. He looks like he is going to be sick.',
    arcSeed: 'Someone believes the party is on the wrong timeline, and they know who wrote it.',
  },
  {
    mode: 'aftermath', delivery: 'rumor', arcFlavor: 'mystery', urgency: 'now',
    trigger: 'The mood in the room flipped the moment one of you spoke that name.',
    hook: 'Conversations stopped at the next three tables. The innkeeper put down the rag they were wiping the bar with. After a long moment, an old man said, very quietly, "We do not say that name in this town anymore. Not since." He did not finish the sentence.',
    arcSeed: 'Something the party referenced in passing is a regional taboo with a buried history.',
  },
  {
    mode: 'aftermath', delivery: 'environmental', arcFlavor: 'mystery', urgency: 'pressing',
    trigger: 'The bodies are gone.',
    hook: 'All of them. The clearing where the fight happened is clean — not just bodies-removed clean, but never-happened clean. The blood is gone. The arrows are gone. The grass is not even pressed down. Someone has been very thorough, very recently.',
    arcSeed: 'An organization with a stake in keeping recent events quiet just announced itself by erasing them.',
  },

  // ── Threat ─────────────────────────────────────────────────────────
  {
    mode: 'pivot', delivery: 'messenger', arcFlavor: 'threat', urgency: 'now',
    trigger: 'The door bangs open. A breathless rider falls more than steps through it, blood on her boots.',
    hook: '"They are a day behind me," she gasps. "Maybe less. They are asking for you by name in every village they pass through, and they are not asking politely." She fumbles a torn banner from her cloak before she goes still.',
    arcSeed: 'A named hunter — or hunters — are on the party\'s trail and closing.',
  },
  {
    mode: 'aftermath', delivery: 'rumor', arcFlavor: 'threat', urgency: 'pressing',
    trigger: 'Word travels faster than you do. By the time you reach the next town, your faces are on a poster — and there is a price on each of them.',
    hook: 'The reward is being paid by someone the local watch is afraid to name, in coin none of the local merchants will touch. People look at you, then look away. The poster is fresh — the paste is still wet.',
    arcSeed: 'An enemy has decided the party is worth killing, and worth being seen to want killed.',
  },
  {
    mode: 'pivot', delivery: 'discovery', arcFlavor: 'threat', urgency: 'pressing',
    trigger: 'Buried under the floorboards where you stopped to rest is a small iron box.',
    hook: 'It is full of small wax-sealed phials, each labeled with a name in tidy script. One of the names is the village you slept in last night. The wax on that phial is broken.',
    arcSeed: 'A slow poisoning is in motion across the region — and you may have already drunk from one well.',
  },
  {
    mode: 'pivot', delivery: 'environmental', arcFlavor: 'threat', urgency: 'slow-burn',
    trigger: 'The crows. None of you noticed when they arrived, only that the sky is full of them now, very quietly, all facing the same direction.',
    hook: 'Locals close their shutters one by one without a word. The innkeeper says, "They come three days before. Always three. We have not seen them in twenty years." He goes to lock the door.',
    arcSeed: 'An old, scheduled disaster — one the region knows the timing of — is about to arrive.',
  },
  {
    mode: 'aftermath', delivery: 'npc-interrupt', arcFlavor: 'threat', urgency: 'now',
    trigger: 'You are still cleaning blood from the floor when a stranger steps over the threshold.',
    hook: 'She looks at the body, then at you, and smiles like she has been hoping for exactly this. "Oh, good," she says, "they sent someone capable this time. Pack your things. We have very little time."',
    arcSeed: 'The recent fight just graduated the party into someone else\'s larger war, and they have come to collect.',
  },
  {
    mode: 'pivot', delivery: 'environmental', arcFlavor: 'threat', urgency: 'now',
    trigger: 'The well in the square is humming.',
    hook: 'Children are being pulled away from it by parents who do not look at it. The water in it is going down. Not slowly. You can see it dropping. There is something at the bottom now that is not stone.',
    arcSeed: 'An imprisoned thing is finishing its escape, and the locals know — they just hoped to be elsewhere when it happened.',
  },
  {
    mode: 'pivot', delivery: 'discovery', arcFlavor: 'threat', urgency: 'slow-burn',
    trigger: 'The map you bought from the cartographer last week has gained a feature.',
    hook: 'Where the old forest road used to be, there is now a small inked X, and beneath it, in cramped script: "Here." The cartographer has been dead since three days before you bought the map.',
    arcSeed: 'Someone is editing the party\'s maps after the fact, directing them to a location.',
  },
  {
    mode: 'pivot', delivery: 'messenger', arcFlavor: 'threat', urgency: 'slow-burn',
    trigger: 'The carrier pigeon at your window is not exhausted. It has been waiting.',
    hook: 'Tied to its leg is a single strip of black silk. No message. None needed — one of you grew up in a household where that meant exactly one thing. It is a marker. A name went on a list this morning. The list is short.',
    arcSeed: 'A PC\'s old contract — order, vendetta, or guild — has reactivated with a clock the party has not been shown.',
  },
  {
    mode: 'pivot', delivery: 'npc-interrupt', arcFlavor: 'threat', urgency: 'slow-burn',
    trigger: 'The well-dressed stranger asks, politely, if he might sit.',
    hook: 'He sits. He looks at each of you in turn, takes his time, makes notes in a small leather book. "No need to interrupt your meal," he says. "I am only confirming the resemblance. The bounty does not begin for ten days. You will have time to settle your affairs." He stands, bows, and leaves.',
    arcSeed: 'A countdown has been started on the party by someone organized enough to do the paperwork in advance.',
  },
  {
    mode: 'aftermath', delivery: 'rumor', arcFlavor: 'threat', urgency: 'now',
    trigger: 'The innkeeper looks up when you walk in and immediately looks away. So does the next person. So does the next.',
    hook: 'By the third table, one of you catches the whisper: "…the ones who killed him. They came back. They came back." Hands move toward weapons under tables. No one is meeting your eyes. Someone slips out the back door.',
    arcSeed: 'A recent victim of the party had connections the party did not know about — and the town has decided what to do about it.',
  },

  // ── Faction ────────────────────────────────────────────────────────
  {
    mode: 'pivot', delivery: 'messenger', arcFlavor: 'faction', urgency: 'slow-burn',
    trigger: 'A liveried courier finds you mid-meal — very polite, very young, very nervous.',
    hook: 'He hands one of you a wax-sealed invitation to a private audience two weeks hence. The sigil belongs to a house you have heard of and never been welcome in. The seal also bears a smaller mark in red wax — a warning that other invitations went out at the same time, to people who are not the party\'s friends.',
    arcSeed: 'Two rival houses are courting the party. Each knows the other is.',
  },
  {
    mode: 'pivot', delivery: 'rumor', arcFlavor: 'faction', urgency: 'slow-burn',
    trigger: 'The crier in the square is on his fifth round of the same announcement.',
    hook: 'A trade compact between two great cities collapsed at midnight. Borders are tightening. Caravans are stranded. The wagon you came in on can be searched at three checkpoints between here and the road home. People are choosing sides without saying which one.',
    arcSeed: 'A regional cold war just turned warmer, and neutrality is no longer a position.',
  },
  {
    mode: 'aftermath', delivery: 'discovery', arcFlavor: 'faction', urgency: 'pressing',
    trigger: 'Going through the dead villain\'s correspondence, you find a folded paper one of you almost discards.',
    hook: 'It is a contract — half-signed — that names the party as "the assets to be acquired or removed." The counter-signatory has a sigil but no name. The price for "removal" is already paid, in advance, by someone you have never heard of.',
    arcSeed: 'A third party paid for the party\'s deaths up front. The killer they just put down was only the first attempt.',
  },
  {
    mode: 'pivot', delivery: 'environmental', arcFlavor: 'faction', urgency: 'slow-burn',
    trigger: 'You notice the banners changing through the town as you walk it.',
    hook: 'Half the houses are flying the old colors. Half are flying a new one — black with a single white eye. Nobody is selling either flag. They are appearing overnight. People crossing each other on the street are starting to nod, or not nod, in patterns.',
    arcSeed: 'A new movement is taking the streets in silence, and the town is choosing sides without anyone giving a speech.',
  },
  {
    mode: 'pivot', delivery: 'npc-interrupt', arcFlavor: 'faction', urgency: 'now',
    trigger: 'She sits down across from you uninvited and orders a drink she does not touch.',
    hook: '"My employer apologizes for the abruptness," she says, sliding a small wooden token across the table. "But the offer is time-sensitive, and the alternative is being made the same offer by the people across the river. They will not be as polite." She waits.',
    arcSeed: 'A faction is recruiting the party, and is being honest about competing recruiters.',
  },
  {
    mode: 'pivot', delivery: 'discovery', arcFlavor: 'faction', urgency: 'slow-burn',
    trigger: 'Pinned to the inside of the cloak you just took is a small enameled pin you almost miss.',
    hook: 'It is the size of a fingernail, the shape of a key inside a circle. None of you have seen the symbol before. The clerk at the next bank you visit will swallow when they see it, refuse to take your custom, and warn you very quietly to put it somewhere no one else will see.',
    arcSeed: 'The party has come into possession of a token from a hidden organization — and people who know what it means are afraid.',
  },
  {
    mode: 'pivot', delivery: 'rumor', arcFlavor: 'faction', urgency: 'now',
    trigger: 'The militia captain you spoke to yesterday is dead. Three of you hear it within the hour, from three different mouths.',
    hook: 'All three accounts say the same thing: he was found in his bed with his sword still in its scabbard, eyes open, no marks. He had told two people he was meeting you in the morning to share what he had learned. The two people are missing.',
    arcSeed: 'Whoever silenced the captain is finishing the cleanup, and the party is on the list.',
  },
  {
    mode: 'aftermath', delivery: 'npc-interrupt', arcFlavor: 'faction', urgency: 'slow-burn',
    trigger: 'You are nearly out of the village when a hooded figure overtakes you on the road.',
    hook: 'She does not stop. She presses a small folded paper into one of your hands as she passes, mutters "Burn this after you read it," and keeps walking at the same pace until she rounds a bend. Inside the paper is a map and a name. You burned an effigy of that name two weeks ago.',
    arcSeed: 'A faction whose enemy you helped take down is offering to repay the debt — and the debt may be unwelcome.',
  },
  {
    mode: 'pivot', delivery: 'environmental', arcFlavor: 'faction', urgency: 'pressing',
    trigger: 'There are soldiers in the streets. There were not, an hour ago.',
    hook: 'They wear no colors you recognize. They are not looking for anyone in particular. They are politely escorting people indoors. Lanterns are being lit early. They look at you as you pass and one of them, very quietly, says a name. It is one of yours.',
    arcSeed: 'A faction has occupied the town quietly while the party was here, and they know the party is too.',
  },
  {
    mode: 'aftermath', delivery: 'messenger', arcFlavor: 'faction', urgency: 'now',
    trigger: 'While the bodies are still warm, a man in clean livery picks his way through them to where you are.',
    hook: 'He does not look at the dead. He looks at the party. "My lord saw," he says. "He sends his regard. He requests that you wait here. He is half a day out. He prefers to make this offer in person." He produces a chair, very politely, and sits in it himself to wait.',
    arcSeed: 'A noble has been watching what just happened, and is investing in the party before anyone else can.',
  },

  // ── Personal ───────────────────────────────────────────────────────
  {
    mode: 'pivot', delivery: 'messenger', arcFlavor: 'personal', urgency: 'slow-burn',
    trigger: 'The letter is for one of you specifically. The handwriting is one you grew up reading.',
    hook: 'It is from someone you have not spoken to in years — and it does not ask for help. It asks where to send the body. It asks if the family plot is still in the same place. It does not say whose body.',
    arcSeed: 'Someone from a PC\'s past is dying or recently dead — and the PC must decide whether to go.',
  },
  {
    mode: 'pivot', delivery: 'rumor', arcFlavor: 'personal', urgency: 'slow-burn',
    trigger: 'The drunk in the corner has been staring. Now he is mumbling.',
    hook: '"…the spit of your father, you are. I served under him at the river crossing. He owes me three silver and a story I have been waiting half my life to tell." He looks up, lucid for one frightening moment, and waits.',
    arcSeed: 'A PC\'s family history is about to walk back into their life, drink in hand.',
  },
  {
    mode: 'aftermath', delivery: 'discovery', arcFlavor: 'personal', urgency: 'pressing',
    trigger: 'Searching the dead captain\'s quarters, you find a small locket.',
    hook: 'The miniature inside it is unmistakably a face one of you knows — younger by years, but theirs. The locket is closed with a hair you cannot have grown yet. The captain has been carrying it since before any of you were born.',
    arcSeed: 'A PC was being watched, expected, or hunted long before they were old enough to know it.',
  },
  {
    mode: 'pivot', delivery: 'environmental', arcFlavor: 'personal', urgency: 'slow-burn',
    trigger: 'The road you have been walking starts to feel familiar.',
    hook: 'One of you stops and says it out loud: "I have been here." None of you have, you think. But the next bend — the bend you have not reached yet — they describe before you can see it. The stone they describe is there. Word for word.',
    arcSeed: 'A PC has memories they did not earn, leading them somewhere specific.',
  },
  {
    mode: 'pivot', delivery: 'npc-interrupt', arcFlavor: 'personal', urgency: 'now',
    trigger: 'She steps out of the crowd, takes one of your hands, and her smile breaks.',
    hook: '"I knew you would come," she says. "I knew you would." She is holding your hand like she is afraid to let go. You have never seen her before. She is calling you by a name that is not yours, but that you recognize from a story your grandmother used to tell.',
    arcSeed: 'A PC has been mistaken — or correctly identified — as someone out of family legend.',
  },
  {
    mode: 'aftermath', delivery: 'environmental', arcFlavor: 'personal', urgency: 'pressing',
    trigger: 'It does not hit you until the next morning when one of you wakes early.',
    hook: 'The scar on the back of your hand — the one you have had since childhood — is glowing, very faintly. It is glowing in time with something. You can feel a heartbeat through it that is not yours. Something you did yesterday turned a key you did not know was in you.',
    arcSeed: 'A latent inheritance — magical, ancestral, cursed — has activated, and the PC has no instructions.',
  },
  {
    mode: 'pivot', delivery: 'discovery', arcFlavor: 'personal', urgency: 'slow-burn',
    trigger: 'Going through the box of old letters the innkeep agreed to store for you, one of you finds a letter you do not remember writing.',
    hook: 'It is in your handwriting. It is dated next month. It is addressed to a person whose name you have to read three times to believe is written there. It begins, "If you are reading this, do not go."',
    arcSeed: 'A self-warning has crossed back to the party, and they do not yet know what they were supposed to avoid.',
  },
  {
    mode: 'pivot', delivery: 'rumor', arcFlavor: 'personal', urgency: 'pressing',
    trigger: 'The bard in the corner of the inn changes songs when you walk in.',
    hook: 'The new song is about one of you, by name, in a deed you absolutely did not do — a deed you would be remembered for. The bard sings it like it was last week. The patrons look at the PC like they remember it happening.',
    arcSeed: 'Someone is rewriting one of the party\'s reputations in real time. The question is who, and to what end.',
  },
  {
    mode: 'pivot', delivery: 'messenger', arcFlavor: 'personal', urgency: 'pressing',
    trigger: 'The boy with the message is barefoot and exhausted, and refuses to deliver it to anyone but you specifically.',
    hook: '"She said you would know," he gasps. "She said tell you only this: the place you swore never to go again, she has gone there. She left three days ago. She said you would understand." He has not been paid. He came on a promise of a meal.',
    arcSeed: 'A person from a PC\'s past has called in an old oath by going somewhere they were forbidden to go.',
  },
  {
    mode: 'aftermath', delivery: 'rumor', arcFlavor: 'personal', urgency: 'now',
    trigger: 'On your way out of the temple, a priest stops you with one hand.',
    hook: '"Your debt is now twice owed," she says, to the PC who entered second. "You did not know? Your mother\'s debt to this house has come of age. I am sorry to be the one to tell you. The terms are in the ledger. Today is the date."',
    arcSeed: 'A debt from a PC\'s family lineage just came due, and the institution holding it is patient but unyielding.',
  },

  // ── Wonder ─────────────────────────────────────────────────────────
  {
    mode: 'pivot', delivery: 'messenger', arcFlavor: 'wonder', urgency: 'slow-burn',
    trigger: 'A bird lands on your table that should not exist.',
    hook: 'It is white, the size of a small dog, and where its eyes should be there are two small mirrors. It sets a folded square of silk in front of you and waits, very polite. The silk has a map on it that updates as you watch — slowly, like a tide coming in.',
    arcSeed: 'Something far beyond mortal scale has decided to correspond with the party.',
  },
  {
    mode: 'pivot', delivery: 'discovery', arcFlavor: 'wonder', urgency: 'slow-burn',
    trigger: 'Sweeping out the corner of the barn, you find a coin.',
    hook: 'It is heavier than coin has any right to be, and warm. On one face is a sun with too many rays. On the other is a date — not a year you know. Not any year. Just a date. The coin hums very softly when you set it down. The barn cat refuses to look at it.',
    arcSeed: 'An artifact of unknown provenance has chosen the party, and it is keeping time for something.',
  },
  {
    mode: 'aftermath', delivery: 'environmental', arcFlavor: 'wonder', urgency: 'slow-burn',
    trigger: 'It is not until you are well outside the village that one of you stops and looks back.',
    hook: 'The sky over the village is the wrong color. Just over the village. The line between its sky and the surrounding sky is sharp enough to draw with a ruler. None of you noticed while you were under it.',
    arcSeed: 'A region the party just left is under an effect that did not originate there — and was hiding from the people in it.',
  },
  {
    mode: 'pivot', delivery: 'rumor', arcFlavor: 'wonder', urgency: 'slow-burn',
    trigger: 'A traveling scholar has been asking after you, table to table, with very specific questions.',
    hook: 'She is not looking for trouble. She is looking for confirmation. She has a book of sketches — old, hand-drawn — and she wants to know if any of the figures in them look familiar. One of them does. Several of them do. The book is dated nine centuries ago.',
    arcSeed: 'Faces matching the party appear in an ancient record. A scholar wants to know why.',
  },
  {
    mode: 'pivot', delivery: 'npc-interrupt', arcFlavor: 'wonder', urgency: 'now',
    trigger: 'He sits down on the bench beside you and offers an apple.',
    hook: 'He is older than weather. He waits until you take a bite before he speaks. "I have been looking forward to meeting you," he says, with the tone of a man finishing a sentence he started a very long time ago. "Walk with me a while. I will not keep you long. Long is not what I do anymore."',
    arcSeed: 'Someone outside of time has appointments with the party, and one of them is now.',
  },
  {
    mode: 'pivot', delivery: 'discovery', arcFlavor: 'wonder', urgency: 'now',
    trigger: 'There is a door in your room that you do not remember locking.',
    hook: 'More to the point: it was not there this morning. It is an old door — older than the inn, older than the town — and on the other side of it you can hear someone humming, very softly, a tune one of you has been humming all week without knowing why.',
    arcSeed: 'Something is reaching into the party\'s space from elsewhere, on a frequency one of them is already tuned to.',
  },
  {
    mode: 'pivot', delivery: 'npc-interrupt', arcFlavor: 'wonder', urgency: 'slow-burn',
    trigger: 'The beggar on the corner has not asked for coin from anyone but you.',
    hook: 'He has been there for days. He never asks for coin from you either — only watches, in turn, very respectfully. Today he stands up, brushes off his clothes, and addresses you in a language none of you have ever heard spoken aloud. You understand every word.',
    arcSeed: 'Someone has been waiting in plain sight for the party to be ready for a conversation none of them are ready for.',
  },
  {
    mode: 'pivot', delivery: 'environmental', arcFlavor: 'wonder', urgency: 'pressing',
    trigger: 'All of the children in the village have stopped talking at the same moment.',
    hook: 'They are all looking in the same direction. North. They are not afraid. They are listening to something none of the adults can hear. One of them — a girl no older than seven — turns to the party and says, very calmly, "It is almost time. You should hurry."',
    arcSeed: 'Something is calling the next generation of the village, and they are responding on a schedule the party is now part of.',
  },
  {
    mode: 'pivot', delivery: 'rumor', arcFlavor: 'wonder', urgency: 'now',
    trigger: 'A child runs past the open door of the inn, screaming with delight.',
    hook: '"It is snowing!" she shouts. "Look! Look!" It is high summer. You go to the door. It is not snow. It is something white and very slow, settling on the streets, on the wagons, on the upturned faces. People are laughing. One of you reaches out a hand to catch one, and the moment it touches your skin, you remember something you have never done.',
    arcSeed: 'A wonder is loose in the world, and it is rewriting memories where it touches.',
  },
  {
    mode: 'pivot', delivery: 'messenger', arcFlavor: 'wonder', urgency: 'now',
    trigger: 'Something thumps onto the table between you, hard.',
    hook: 'It is a folded letter. It is sealed with no wax — sealed with frost. The frost is not melting. The room is warm. Outside the window, the bird that delivered it is already three streets away, flying impossibly slow, as if dragging the cold with it.',
    arcSeed: 'A correspondent who exists somewhere cold and far has opened a channel.',
  },
];
