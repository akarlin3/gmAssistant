import { useEffect } from 'react';

/**
 * Registers a `beforeunload` handler that shows the browser's default
 * "leave page?" dialog whenever `isDirty` is true.
 *
 * Usage:
 *   useUnsavedChanges(hasUnsavedEdits);
 */
export function useUnsavedChanges(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore the custom message and show their own dialog,
      // but returnValue must be set for the dialog to appear at all.
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [isDirty]);
}
