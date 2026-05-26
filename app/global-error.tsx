'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global error boundary]', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
          padding: '1.5rem',
          fontFamily: 'Georgia, serif',
          background: '#f4ecd8',
          color: '#2b2118',
        }}
      >
        <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <h1 style={{ color: '#b1201e', fontSize: '1.25rem' }}>Something went wrong</h1>
          <p style={{ lineHeight: 1.6, fontSize: '0.95rem' }}>
            The app hit an unexpected error. Reloading usually fixes it.
          </p>
          {error.digest && (
            <p style={{ fontStyle: 'italic', fontSize: '0.8rem', opacity: 0.7 }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '0.75rem',
              padding: '0.5rem 0.9rem',
              border: '1px solid #b1201e',
              background: 'transparent',
              color: '#b1201e',
              borderRadius: '0.25rem',
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontSize: '0.75rem',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
