// Standalone tool widgets extracted from RunSessionView.tsx.
// Each is self-contained (local state only) — logic is unchanged.
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { TABLES, rollTable } from '@/lib/inspirationTables';
import { LockedInline } from '@/components/LockedFeature';
import { useAuth } from '@/lib/firebase/auth-context';
import { generatePlotSegues } from '@/lib/generators/plot-segue';
import { generateQuickInspire } from '@/lib/generators/quick-inspire';
import type { CampaignContext } from '@/lib/generators/types';
import { makeEvent, type ChangeEvent } from '@/lib/sessionEvents';
import { VoiceDictationButton } from '@/components/ExternalTablePiP';
import { rollDice, SEGUE_ENTRIES } from './helpers';

type DiceRoll = { id: string; expr: string; result: number; breakdown: string; ts: number };

export function QuickDice() {
  const [history, setHistory] = useState<DiceRoll[]>([]);
  const [formula, setFormula] = useState('2d6+3');

  const doRoll = (expr: string) => {
    const r = rollDice(expr);
    if (!r) return;
    setHistory(h => [{ id: `r${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, expr, ...r, ts: Date.now() }, ...h].slice(0, 10));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {[4, 6, 8, 10, 12, 20, 100].map(s => (
          <button
            key={s}
            onClick={() => doRoll(`1d${s}`)}
            className="rounded border border-brass-deep/60 px-2 py-1 font-display text-[11px] uppercase tracking-wider text-brass-deep hover:bg-brass hover:text-parchment"
          >
            d{s}
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') doRoll(formula); }}
          placeholder="2d6+3"
          className="flex-1 rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-xs text-ink"
        />
        <button
          onClick={() => doRoll(formula)}
          className="rounded border border-crimson/60 bg-crimson/10 px-2 py-1 font-display text-[11px] uppercase tracking-wider text-crimson hover:bg-crimson hover:text-parchment"
        >
          Roll
        </button>
      </div>
      {history.length > 0 && (
        <ul className="max-h-32 space-y-0.5 overflow-y-auto">
          {history.map(r => (
            <li key={r.id} className="flex items-baseline gap-2 font-serif text-[11px] text-ink-soft">
              <span className="w-6 text-right font-display tabular-nums text-brass-deep">{r.result}</span>
              <span className="truncate text-ink-mute">{r.breakdown}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type InspireResult = { id: string; tableId: string; tableTitle: string; entry: string; ts: number };

export function QuickInspire({ campaignContext }: { campaignContext?: CampaignContext }) {
  const { isPro } = useAuth();
  const [tableId, setTableId] = useState<string>('villainSchemes');
  const [history, setHistory] = useState<InspireResult[]>([]);
  const [rolling, setRolling] = useState(false);
  const [error, setError] = useState('');
  const [aiBased, setAiBased] = useState(false);

  const tableEntries = useMemo(() => {
    return Object.values(TABLES).map(t => ({ id: t.id, title: t.title })).sort((a, b) => a.title.localeCompare(b.title));
  }, []);

  const isSegue = tableId.startsWith('segue:');
  const segueEntry = isSegue ? SEGUE_ENTRIES.find(s => s.id === tableId) : null;

  const pushHistory = (id: string, title: string, entry: string) => {
    setHistory(h => [{
      id: `i${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      tableId: id, tableTitle: title, entry, ts: Date.now(),
    }, ...h].slice(0, 5));
  };

  const doRoll = async () => {
    setError('');
    if (segueEntry) {
      if (!isPro) return;
      setRolling(true);
      try {
        const user = (await import('@/lib/firebase/client')).getFirebaseAuth().currentUser;
        if (!user) throw new Error('Not signed in');
        const idToken = await user.getIdToken();
        const result = await generatePlotSegues(
          { segueType: segueEntry.type, count: 1, tone: 'escalating', currentScene: '' },
          idToken,
          campaignContext,
        );
        const s = result.segues[0];
        if (s) pushHistory(segueEntry.id, segueEntry.title, `${s.title} — ${s.readAloud}`);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Roll failed');
      } finally {
        setRolling(false);
      }
      return;
    }
    const t = TABLES[tableId];
    if (aiBased) {
      if (!isPro) return;
      setRolling(true);
      try {
        const user = (await import('@/lib/firebase/client')).getFirebaseAuth().currentUser;
        if (!user) throw new Error('Not signed in');
        const idToken = await user.getIdToken();
        const result = await generateQuickInspire(t.title, idToken, campaignContext);
        if (result && result.entry) pushHistory(tableId, t.title, result.entry);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Roll failed');
      } finally {
        setRolling(false);
      }
      return;
    }
    const entry = rollTable(tableId);
    if (!entry) return;
    pushHistory(tableId, t.title, entry);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <select
          value={tableId}
          onChange={(e) => { setTableId(e.target.value); setError(''); }}
          className="flex-1 rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-xs text-ink"
        >
          <optgroup label="AI (Pro)">
            {SEGUE_ENTRIES.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </optgroup>
          <optgroup label="Curated tables">
            {tableEntries.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </optgroup>
        </select>
        {((isSegue || aiBased) && !isPro) ? (
          <LockedInline label="Roll (Pro)" />
        ) : (
          <button
            onClick={doRoll}
            disabled={rolling}
            className="rounded border border-crimson/60 bg-crimson/10 px-2 py-1 font-display text-[11px] uppercase tracking-wider text-crimson hover:bg-crimson hover:text-parchment disabled:opacity-50"
          >
            {rolling ? 'Rolling…' : 'Roll'}
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="checkbox"
          id="aiBasedQuickInspire"
          checked={aiBased}
          onChange={(e) => setAiBased(e.target.checked)}
          className="cursor-pointer rounded border-rule text-crimson focus:ring-crimson"
        />
        <label htmlFor="aiBasedQuickInspire" className="flex cursor-pointer select-none items-center gap-1 text-[11px] text-ink-soft">
          Make all rolls AI based {aiBased && !isPro && <LockedInline label="(Pro)" />}
        </label>
      </div>
      {error && <p className="text-[10px] italic text-crimson" title={error}>{error}</p>}
      {history.length === 0 ? (
        <p className="font-serif text-[11px] italic text-ink-mute">No rolls yet.</p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {history.map(r => (
            <li key={r.id} className="border-l-2 border-brass/40 pl-2 font-serif text-[11px] text-ink-soft">
              <div className="font-display text-[9px] uppercase tracking-wider text-brass-deep">{r.tableTitle}</div>
              {r.entry}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NoteSeed({
  pushEvent,
  mentionableNames = [],
}: {
  pushEvent: (e: ChangeEvent) => void;
  mentionableNames?: string[];
}) {
  const [text, setText] = useState('');
  return (
    <details className="rounded border border-rule bg-parchment-soft shadow-card">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 font-display text-sm tracking-wide text-ink hover:bg-parchment-deep/30">
        <Plus size={12} className="text-brass-deep" /> Add Session Note
      </summary>
      <div className="space-y-1.5 border-t border-rule px-3 pb-3 pt-1">
        <div className="flex items-center gap-1.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="A moment to remember…"
            className="flex-1 rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink"
          />
          <VoiceDictationButton
            entityNames={mentionableNames}
            onTranscript={(spoken) => setText((prev) => `${prev ? `${prev} ` : ''}${spoken}`)}
          />
        </div>
        <button
          disabled={!text.trim()}
          onClick={() => { pushEvent(makeEvent('other', text.trim())); setText(''); }}
          className="rounded border border-crimson/60 bg-crimson/10 px-2 py-1 font-display text-xs uppercase tracking-wider text-crimson hover:bg-crimson hover:text-parchment disabled:cursor-not-allowed disabled:opacity-40"
        >
          Mark as Session Note
        </button>
      </div>
    </details>
  );
}

