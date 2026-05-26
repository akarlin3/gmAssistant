import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { loadSlotChoice, saveSlotChoice, clearSlotChoice } from '../slotStorage';

describe('slotStorage', () => {
  let store: Record<string, string> = {};

  beforeAll(() => {
    const localStorageMock = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { store = {}; },
      length: 0,
      key: (index: number) => null,
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });
  });

  beforeEach(() => {
    store = {};
  });

  it('round-trips a slot choice keyed by token', () => {
    saveSlotChoice({ shareToken: 'tok', tokenVersion: 2, slotId: 'slot-a' });
    expect(loadSlotChoice('tok')).toEqual({ shareToken: 'tok', tokenVersion: 2, slotId: 'slot-a' });
  });

  it('returns null for an unknown token', () => {
    expect(loadSlotChoice('nope')).toBeNull();
  });

  it('does not return a choice stored under a different token', () => {
    saveSlotChoice({ shareToken: 'tok-a', tokenVersion: 1, slotId: 'slot-a' });
    expect(loadSlotChoice('tok-b')).toBeNull();
  });

  it('clear removes the stored choice', () => {
    saveSlotChoice({ shareToken: 'tok', tokenVersion: 1, slotId: 'slot-a' });
    clearSlotChoice('tok');
    expect(loadSlotChoice('tok')).toBeNull();
  });

  it('ignores corrupt JSON', () => {
    window.localStorage.setItem('playerSlot:tok', '{not json');
    expect(loadSlotChoice('tok')).toBeNull();
  });
});
