import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeneratorPanel } from '../GeneratorPanel';
import React from 'react';

vi.mock('@/lib/firebase/auth-context', () => ({
  useAuth: () => ({ isPro: false }),
}));

const scrollIntoView = vi.fn();
// jsdom doesn't implement scrollIntoView.
(Element.prototype as any).scrollIntoView = scrollIntoView;

function renderPanel() {
  const generate = vi.fn(() => ({ kind: 'trinket', enhanced: false, id: 't1' }) as any);
  return render(
    <GeneratorPanel
      title="Treasure Hoards"
      inputs={[]}
      generate={generate}
      renderResult={(r: any) => <div data-testid="result">Result {r.id}</div>}
    />,
  );
}

describe('GeneratorPanel (B-09)', () => {
  beforeEach(() => {
    scrollIntoView.mockClear();
  });

  it('scrolls the result panel into view after Generate', () => {
    renderPanel();
    expect(screen.queryByTestId('result')).toBeNull();
    act(() => {
      fireEvent.click(screen.getByText('Generate'));
    });
    expect(screen.getByTestId('result')).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalled();
  });
});
