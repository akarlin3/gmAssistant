import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CommandPalette, { type CommandItem } from '../CommandPalette';
import React from 'react';

// jsdom doesn't implement scrollIntoView, which the palette calls on its
// selected row.
(Element.prototype as any).scrollIntoView = vi.fn();

const items: CommandItem[] = [
  { id: 'a', label: 'Go to NPCs', group: 'Navigation', run: vi.fn() },
  { id: 'b', label: 'Go to Locations', group: 'Navigation', run: vi.fn() },
];

describe('CommandPalette (B-08)', () => {
  it('auto-focuses its search input when opened', () => {
    render(<CommandPalette open onClose={vi.fn()} items={items} />);
    const input = screen.getByPlaceholderText(/Jump to a tab/i);
    expect(input).toHaveFocus();
  });

  it('captures typing without an explicit click on the input', () => {
    render(<CommandPalette open onClose={vi.fn()} items={items} />);
    const input = screen.getByPlaceholderText(/Jump to a tab/i) as HTMLInputElement;
    // Typing immediately after open should land in the focused input, not body.
    fireEvent.change(input, { target: { value: 'locations' } });
    expect(input.value).toBe('locations');
  });
});
