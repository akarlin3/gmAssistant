/**
 * Simulated "development mode" responses for the Anthropic-compatible bridge.
 *
 * Used when no usable API key (Anthropic or Gemini) is available. The exact
 * text and tool-call fixtures are preserved verbatim from the original inline
 * implementation so downstream output is unchanged.
 */

import { newMessageId, newToolUseId } from './ids';
import {
  buildMessageResponse,
  type ContentBlock,
  type MessageCreateOptions,
  type MessageResponse,
  type ResponseContentBlock,
  type StreamChunk,
  type StreamWrapper,
} from './types';

const MOCK_MODEL = 'mock-assistant';

function lastUserText(options: MessageCreateOptions): string {
  const lastUserMsg = [...options.messages].reverse().find((m) => m.role === 'user');
  return typeof lastUserMsg?.content === 'string'
    ? lastUserMsg.content
    : Array.isArray(lastUserMsg?.content)
      ? (lastUserMsg.content as ContentBlock[])
          .map((c) => (c as { text?: string }).text || '')
          .join(' ')
      : 'hello';
}

export function getMockResponse(options: MessageCreateOptions): MessageResponse {
  const outputConfig = (options as unknown as { output_config?: { format?: { type?: string } } }).output_config;
  if (outputConfig?.format?.type === 'json_schema') {
    const mockSheet = {
      name: 'Lyra Silverhand',
      player: '',
      race: 'High Elf',
      classLevel: 'Wizard 5 (Evocation)',
      gestalt: false,
      classLevel2: '',
      background: 'Sage',
      alignment: 'Neutral Good',
      experience: '6500',
      abilities: {
        str: '8 (-1)',
        dex: '14 (+2)',
        con: '14 (+2)',
        int: '18 (+4)',
        wis: '12 (+1)',
        cha: '10 (+0)',
      },
      saves: 'INT +7, WIS +4',
      ac: '15',
      hp: '32',
      hpMax: '32',
      initiative: '+2',
      speed: '30',
      profBonus: '+3',
      hitDice: '5d6',
      skills: 'Arcana +7, History +7, Investigation +7, Perception +4',
      passivePerception: '14',
      languages: 'Common, Elvish, Draconic, Celestial',
      proficiencies: 'Daggers, darts, slings, quarterstaffs, light crossbows',
      attacks: [
        { name: 'Fire Bolt', bonus: '+7', damage: '2d10 fire', notes: '120 ft.' },
        { name: 'Quarterstaff', bonus: '+2', damage: '1d6-1 bludgeoning', notes: 'Versatile (1d8)' },
      ],
      equipment: 'Spellbook\nArcane Focus\nScholar\'s Pack\nCloak of Protection',
      currency: { cp: '0', sp: '15', ep: '0', gp: '120', pp: '2' },
      features: 'Arcane Recovery. Recover spell slots on a short rest. (Wizard 1)\nSculpt Spells. Protect allies from evocation spells. (Wizard 2)',
      personality: 'Curious and methodical.',
      ideals: 'Knowledge is the path to enlightenment.',
      bonds: 'I guard an ancient tome of Netherese lore.',
      flaws: 'I overlook obvious danger when ancient magic is involved.',
      appearance: 'Silver hair and starlight-blue robes.',
      backstory: 'Trained at the Blackstaff Tower.',
      spellcasting: {
        ability: 'INT',
        saveDC: '15',
        attackBonus: '+7',
        slots: 'L1: 4, L2: 3, L3: 2',
      },
      spells: 'Cantrip — Fire Bolt\nLvl 1 — Mage Armor\nLvl 1 — Shield\nLvl 2 — Hold Person\nLvl 2 — Misty Step\nLvl 3 — Fireball\nLvl 3 — Counterspell',
      notes: 'Darkvision 60 ft.',
    };
    return buildMessageResponse(
      MOCK_MODEL,
      [{ type: 'text', text: JSON.stringify(mockSheet) }],
      newMessageId,
    );
  }

  const content: ResponseContentBlock[] = [];
  const userText = lastUserText(options);

  let responseText = `[Simulated Assistant in Development Mode]\n`;
  responseText += `Hello! Your API keys are either missing or restricted, so I am running in simulated development mode. You asked: "${userText.slice(0, 100)}..."\n\n`;

  if (userText.toLowerCase().includes('npc') || userText.toLowerCase().includes('character')) {
    responseText += `Here is a simulated NPC proposal for your campaign:`;
    content.push({
      type: 'tool_use',
      id: newToolUseId(),
      name: 'createNpc',
      input: {
        name: 'Gromph Baenre',
        title: 'Archmage of Menzoberranzan',
        traits: 'Ambitious, cold, calculating, intensely intelligent',
        voice: 'Raspy, slow, menacingly formal',
        goals: 'Maintain political power and unlock ancient shadow magic',
      },
    });
  } else if (userText.toLowerCase().includes('secret') || userText.toLowerCase().includes('clue')) {
    responseText += `Here is a simulated secret proposal for your session prep:`;
    content.push({
      type: 'tool_use',
      id: newToolUseId(),
      name: 'createSecret',
      input: {
        rawText: 'The Archmage is secretly smuggling shadow daggers into the city.',
      },
    });
  } else {
    responseText += `I can help you build NPCs, write secrets, outline scenes, or prep your sessions! Try asking me to "create an NPC" or "generate a secret" to see how tool proposals work.`;
  }

  content.unshift({ type: 'text', text: responseText });

  return buildMessageResponse(MOCK_MODEL, content, newMessageId);
}

export class MockStreamWrapper implements StreamWrapper {
  private options: MessageCreateOptions;
  private finalMsgPromise: Promise<MessageResponse>;
  private resolveFinalMsg!: (val: MessageResponse) => void;

  constructor(options: MessageCreateOptions) {
    this.options = options;
    this.finalMsgPromise = new Promise((resolve) => {
      this.resolveFinalMsg = resolve;
    });
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<StreamChunk> {
    const mock = getMockResponse(this.options);
    const textBlock = mock.content.find((c) => c.type === 'text');
    const text = textBlock ? (textBlock as { text: string }).text : '';

    const chunks = text.split(/(\s+)/);
    for (const chunk of chunks) {
      if (!chunk) continue;
      yield {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: chunk },
      };
      await new Promise((resolve) => setTimeout(resolve, 30));
    }

    yield { type: 'message_stop' };

    this.resolveFinalMsg(mock);
  }

  async finalMessage(): Promise<MessageResponse> {
    return this.finalMsgPromise;
  }
}
