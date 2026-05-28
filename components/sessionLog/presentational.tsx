import type { SessionLogEntry } from '@/lib/sessionLog';

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">{label}</div>
      <div className="font-display text-base text-ink">{value}</div>
    </div>
  );
}

export function CompareCol({ entry, side }: { entry: SessionLogEntry; side: string }) {
  return (
    <div className="space-y-1 rounded border border-rule bg-parchment p-2">
      <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">{side} · Session {entry.number}</div>
      <div className="font-display text-ink">{entry.title || `Session ${entry.number}`}</div>
      <div className="text-[11px] text-ink-mute">{entry.date} · {entry.events.length} events</div>
      <ul className="max-h-40 space-y-0.5 overflow-y-auto text-[11px] text-ink-soft">
        {entry.events.slice(0, 12).map(e => <li key={e.id}>· {e.summary}</li>)}
      </ul>
    </div>
  );
}

export function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="mb-0.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">{title}</div>
      <ul className="space-y-0.5">
        {items.map((s, i) => (
          <li key={i} className="font-serif text-[11px] text-ink-soft">· {s}</li>
        ))}
      </ul>
    </div>
  );
}
