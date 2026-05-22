import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmProvider, useConfirm } from '../ConfirmDialog';
import React from 'react';

// Create a test component to consume the hook
function TestComponent({ options }: { options: any }) {
  const confirm = useConfirm();
  const [result, setResult] = React.useState<string>('idle');

  return (
    <div>
      <div data-testid="result">{result}</div>
      <button
        onClick={async () => {
          const res = await confirm(options);
          setResult(res ? 'confirmed' : 'cancelled');
        }}
      >
        Trigger Confirm
      </button>
    </div>
  );
}

describe('ConfirmDialog', () => {
  it('renders correctly and handles confirm', async () => {
    render(
      <ConfirmProvider>
        <TestComponent options={{ title: 'Test Title', message: 'Test Message' }} />
      </ConfirmProvider>
    );

    // Trigger the confirm dialog
    fireEvent.click(screen.getByText('Trigger Confirm'));

    // Check if dialog content is rendered
    expect(screen.getByText('Test Title')).toBeDefined();
    expect(screen.getByText('Test Message')).toBeDefined();
    expect(screen.getByText('Confirm')).toBeDefined();
    expect(screen.getByText('Cancel')).toBeDefined();

    // Click confirm
    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('result').textContent).toBe('confirmed');
    });
  });

  it('handles cancel correctly', async () => {
    render(
      <ConfirmProvider>
        <TestComponent options={{ title: 'Test Title', message: 'Test Message' }} />
      </ConfirmProvider>
    );

    fireEvent.click(screen.getByText('Trigger Confirm'));
    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.getByTestId('result').textContent).toBe('cancelled');
    });
  });

  it('customizes buttons correctly', async () => {
    render(
      <ConfirmProvider>
        <TestComponent options={{ title: 'Test Title', message: 'Test Message', confirmText: 'Yes', cancelText: 'No' }} />
      </ConfirmProvider>
    );

    fireEvent.click(screen.getByText('Trigger Confirm'));

    expect(screen.getByText('Yes')).toBeDefined();
    expect(screen.getByText('No')).toBeDefined();
  });
});
