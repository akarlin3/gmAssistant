import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SpellsTab from '../SpellsTab';
import React from 'react';

describe('SpellsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.confirm = vi.fn().mockReturnValue(true);
  });

  it('renders correctly', () => {
    render(<SpellsTab homebrewSpells={[]} onHomebrewSpellsChange={vi.fn()} favorites={[]} onFavoritesChange={vi.fn()} />);
    expect(screen.getByPlaceholderText(/Search/i)).toBeInTheDocument();
  });

  it('searches for a spell', () => {
    render(<SpellsTab homebrewSpells={[]} onHomebrewSpellsChange={vi.fn()} favorites={[]} onFavoritesChange={vi.fn()} />);

    const searchInput = screen.getByPlaceholderText(/Search/i);
    act(() => {
      fireEvent.change(searchInput, { target: { value: 'Acid Splash' } });
    });

    expect(screen.getByText('Acid Splash')).toBeInTheDocument();
  });

  it('filters by level', () => {
    render(<SpellsTab homebrewSpells={[]} onHomebrewSpellsChange={vi.fn()} favorites={[]} onFavoritesChange={vi.fn()} />);

    // There might be multiple '1' text nodes (like spell level display), so let's get the button specifically
    const level1Btn = screen.getByRole('button', { name: '1' });
    act(() => {
      fireEvent.click(level1Btn);
    });

    expect(screen.queryByText('Fireball')).not.toBeInTheDocument();

    // Find a level 1 spell (Alarm is a level 1 spell)
    expect(screen.getByText('Alarm')).toBeInTheDocument();
  });

  it('adds a homebrew spell', () => {
    const onHomebrewChangeMock = vi.fn();
    render(<SpellsTab homebrewSpells={[]} onHomebrewSpellsChange={onHomebrewChangeMock} favorites={[]} onFavoritesChange={vi.fn()} />);

    const addBtn = screen.getByText(/Add Homebrew/i);
    act(() => {
      fireEvent.click(addBtn);
    });

    expect(onHomebrewChangeMock).toHaveBeenCalledWith([expect.objectContaining({ name: '', homebrew: true })]);
  });

  it('deletes a homebrew spell', () => {
    const mockHomebrew = [{
      index: 'hb-123',
      name: 'Custom Fireball',
      desc: ['Does custom fire damage.'],
      higher_level: [],
      range: '120 feet',
      components: ['V', 'S', 'M'],
      material: 'bat guano',
      ritual: false,
      duration: 'Instantaneous',
      concentration: false,
      casting_time: '1 action',
      level: 3,
      school: 'Evocation',
      classes: ['Sorcerer', 'Wizard'],
      homebrew: true,
    }];

    const onHomebrewChangeMock = vi.fn();
    render(<SpellsTab homebrewSpells={mockHomebrew} onHomebrewSpellsChange={onHomebrewChangeMock} favorites={[]} onFavoritesChange={vi.fn()} />);

    // The button has children, so we can search by text and find closest button
    const spellBtn = screen.getAllByText('Custom Fireball')[0].closest('button');
    expect(spellBtn).toBeInTheDocument();
    act(() => {
      fireEvent.click(spellBtn!);
    });

    const deleteBtn = screen.getByText('Delete Spell');
    act(() => {
      fireEvent.click(deleteBtn);
    });

    expect(onHomebrewChangeMock).toHaveBeenCalledWith([]);
  });
});
