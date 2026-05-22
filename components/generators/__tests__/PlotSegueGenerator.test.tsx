import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PlotSegueGenerator from '../PlotSegueGenerator';
import { generatePlotSegues } from '@/lib/generators/plot-segue';
import React from 'react';

// Mock the generate function
vi.mock('@/lib/generators/plot-segue', () => ({
  generatePlotSegues: vi.fn()
}));

// Mock the nested AIGeneratorPanel (just simple wrapper to pass through props)
vi.mock('../AIGeneratorPanel', () => ({
  AIGeneratorPanel: (props: any) => {
    return (
      <div data-testid="ai-generator-panel">
        <button
          onClick={() => props.generate(
            { segueType: 'bridge', count: 2, tone: 'gentle', currentScene: 'Tavern' },
            'fake-token',
            props.campaignContext
          )}
        >
          Generate
        </button>
        <div data-testid="rendered-result">
          {props.renderResult && props.renderResult({
            inputs: { segueType: 'bridge', count: 1, tone: 'gentle', currentScene: '' },
            segues: [
              { title: 'The Call', readAloud: 'A mysterious man approaches.', gmNote: 'He is actually an illusion.' }
            ]
          })}
        </div>
      </div>
    );
  }
}));

describe('PlotSegueGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the component and passes props to AIGeneratorPanel correctly', () => {
    render(
      <PlotSegueGenerator
        entries={[]}
        onEntriesChange={vi.fn()}
      />
    );

    expect(screen.getByTestId('ai-generator-panel')).toBeInTheDocument();
  });

  it('calls generatePlotSegues with correctly mapped inputs', async () => {
    const mockContext = { partyLevel: 5, setting: 'test' };

    render(
      <PlotSegueGenerator
        entries={[]}
        onEntriesChange={vi.fn()}
        campaignContext={mockContext as any}
      />
    );

    fireEvent.click(screen.getByText('Generate'));

    expect(generatePlotSegues).toHaveBeenCalledWith(
      {
        segueType: 'bridge',
        count: 2,
        tone: 'gentle',
        currentScene: 'Tavern'
      },
      'fake-token',
      mockContext
    );
  });

  it('renders result correctly via renderResult', () => {
    render(
      <PlotSegueGenerator
        entries={[]}
        onEntriesChange={vi.fn()}
      />
    );

    expect(screen.getByText('The Call')).toBeInTheDocument();
    expect(screen.getByText('A mysterious man approaches.')).toBeInTheDocument();
    expect(screen.getByText('He is actually an illusion.')).toBeInTheDocument();
  });
});
