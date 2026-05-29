// Utility helpers for run-session inline components.

export function formatElapsed(ms: number): string {
  if (!isFinite(ms) || ms <= 0) return 'just now';
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return 'just now';
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
