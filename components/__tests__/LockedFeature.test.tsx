import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LockedInline, LockedPanel } from '../LockedFeature';

describe('LockedInline', () => {
  it('renders correctly with label', () => {
    render(<LockedInline label="Advanced Generator" />);

    const link = screen.getByRole('link', { name: /Advanced Generator/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/account');
    expect(screen.getByText(/Pro/i)).toBeInTheDocument();
  });
});

describe('LockedPanel', () => {
  it('renders correctly with title and children', () => {
    render(
      <LockedPanel title="Premium Tools">
        Access our finest magical contraptions and deepest dungeons.
      </LockedPanel>
    );

    expect(screen.getByText(/Premium Tools/i)).toBeInTheDocument();
    expect(screen.getByText(/Access our finest magical contraptions and deepest dungeons./i)).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /Join the Pro waitlist/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/account');
  });
});
