'use client';

import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Copy,
  Check,
  Code2,
  FileText,
  MessageSquareQuote,
  CalendarClock,
  Swords,
  Gift,
  PlusCircle,
  Wand2,
} from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { CR_OPTIONS } from '@/components/monsters/constants';
import {
  buildLoreRagContext,
  synthesizeLoreRagOutput,
  type LoreRagMode,
  type SynthesizedLoreRagResult,
} from '@/lib/loreRagContext';
import { applySessionDeltaToState } from '@/lib/world/sessionDelta';
import { makeEntityId } from '@/lib/playerMode/share';
import MentionText from '@/components/wiki/MentionText';

interface LoreRagAssistantProps {
  state: Record<string, any>;
  setState: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  selectedLocationId?: string;
  onSelectLocationId?: (locId: string) => void;
  compact?: boolean;
}

export default function LoreRagAssistant({
  state,
  setState,
  selectedLocationId,
  onSelectLocationId,
  compact = false,
}: LoreRagAssistantProps) {
  const { user, isPro } = useAuth();
  const locations: any[] = useMemo(
    () => (Array.isArray(state.locations) ? state.locations : []),
    [state.locations]
  );

  const [internalLocId, setInternalLocId] = useState<string>(
    selectedLocationId || state.cockpitActiveLocationId || locations[0]?.id || ''
  );
  const activeLocId = selectedLocationId ?? internalLocId;

  const [mode, setMode] = useState<LoreRagMode>('rumors');
  const [targetCr, setTargetCr] = useState<string>('2');
  const [customNotes, setCustomNotes] = useState<string>('');
  const [contextTab, setContextTab] = useState<'none' | 'markdown' | 'json' | 'prompt'>('none');
  const [copied, setCopied] = useState(false);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [result, setResult] = useState<SynthesizedLoreRagResult | null>(null);

  const bundle = useMemo(
    () => buildLoreRagContext(state, { selectedLocationId: activeLocId }),
    [state, activeLocId]
  );

  const activePrompt = useMemo(
    () => bundle.promptForMode(mode, customNotes, targetCr),
    [bundle, mode, customNotes, targetCr]
  );

  const handleLocChange = (nextId: string) => {
    setInternalLocId(nextId);
    onSelectLocationId?.(nextId);
  };

  const handleOneClickSynthesize = (targetMode: LoreRagMode) => {
    setMode(targetMode);
    setAiError(null);
    setSavedBanner(null);
    const synth = synthesizeLoreRagOutput(bundle, targetMode, {
      targetCr,
      customNotes,
    });
    setResult(synth);
  };

  const handleClaudeGenerate = async () => {
    if (!isPro || !user) return;
    setAiLoading(true);
    setAiError(null);
    setSavedBanner(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/lore-rag', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode,
          selectedLocationId: activeLocId,
          targetCr,
          customNotes,
          data: state,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to generate with Claude.');
      }
      const fallbackSynth = synthesizeLoreRagOutput(bundle, mode, {
        targetCr,
        customNotes,
      });
      setResult({
        ...fallbackSynth,
        markdown: payload.markdown || fallbackSynth.markdown,
      });
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiLoading(false);
    }
  };

  const handleCopyPrompt = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors in restricted environments
    }
  };

  const handleSaveResultToCampaign = () => {
    if (!result) return;
    if (result.mode === 'rumors' && result.rumors) {
      setState((prev) => ({
        ...prev,
        secrets: [...(Array.isArray(prev.secrets) ? prev.secrets : []), ...result.rumors!],
      }));
      setSavedBanner('Saved 3 canon rumors to Secrets & Clues!');
    } else if (result.mode === 'deltas' && result.consequenceDeltas) {
      const d = result.consequenceDeltas;
      setState((prev) =>
        applySessionDeltaToState(prev, {
          inWorldDate: d.inWorldDate,
          inWorldDay: bundle.jsonContext.worldState.inWorldDay + 1,
          consequences: d.consequences,
          clockDeltas: d.suggestedClockTick
            ? [
                {
                  clockIndex: 0,
                  clockText: d.suggestedClockTick.clockText,
                  faction: d.suggestedClockTick.faction,
                  fromFilled: bundle.jsonContext.factionClocks[0]?.filled || 0,
                  toFilled: Math.min(
                    bundle.jsonContext.factionClocks[0]?.max || 6,
                    (bundle.jsonContext.factionClocks[0]?.filled || 0) + d.suggestedClockTick.delta
                  ),
                  max: bundle.jsonContext.factionClocks[0]?.max || 6,
                },
              ]
            : [],
          factionHeatDeltas: [],
        })
      );
      setSavedBanner('Recorded consequence delta to Session Delta Log & advanced clock!');
    } else if (result.mode === 'statblock' && result.monster) {
      const m = result.monster;
      setState((prev) => ({
        ...prev,
        homebrewMonsters: [m, ...(Array.isArray(prev.homebrewMonsters) ? prev.homebrewMonsters : [])],
        monsters: [
          ...(Array.isArray(prev.monsters) ? prev.monsters : []),
          `${m.name} — CR ${m.challenge_rating} — ${bundle.jsonContext.location?.name || 'Scene'}`,
        ],
      }));
      setSavedBanner(`Saved "${m.name}" to Homebrew Monsters & queued in Creality K1C Print Queue!`);
    } else if (result.mode === 'item' && result.customItem) {
      const it = result.customItem;
      setState((prev) => ({
        ...prev,
        items: [
          ...(Array.isArray(prev.items) ? prev.items : []),
          {
            id: makeEntityId(),
            name: it.name,
            rarity: it.rarity,
            description: it.description,
            mechanic: it.mechanic,
            gmSpoiler: it.gmSpoiler,
            player_visible: false,
            isPublic: false,
          },
        ],
      }));
      setSavedBanner(`Saved "${it.name}" to Campaign Magic Items!`);
    }
  };

  return (
    <section className="space-y-3 rounded border border-rule bg-parchment p-3.5 shadow-card">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-2.5">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-crimson" />
          <div>
            <h3 className="font-display text-sm uppercase tracking-wider text-ink">
              Lore-Grounded RAG Prep &amp; Stat-Block Assistant
            </h3>
            <p className="font-serif text-xs italic text-ink-mute">
              Auto-injects Module 2 Lore Graph (Location, Linked NPCs/Factions) &amp; Module 3 Faction Clocks
            </p>
          </div>
        </div>

        {/* Context Inspector Toggles */}
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setContextTab(contextTab === 'markdown' ? 'none' : 'markdown')}
            className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-display text-[10px] uppercase tracking-wider ${
              contextTab === 'markdown'
                ? 'border-brass-deep bg-brass text-parchment'
                : 'border-rule bg-parchment-soft text-ink-soft hover:bg-parchment-deep'
            }`}
          >
            <FileText size={10} /> Markdown Context
          </button>
          <button
            type="button"
            onClick={() => setContextTab(contextTab === 'json' ? 'none' : 'json')}
            className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-display text-[10px] uppercase tracking-wider ${
              contextTab === 'json'
                ? 'border-brass-deep bg-brass text-parchment'
                : 'border-rule bg-parchment-soft text-ink-soft hover:bg-parchment-deep'
            }`}
          >
            <Code2 size={10} /> JSON Context
          </button>
          <button
            type="button"
            onClick={() => handleCopyPrompt(activePrompt)}
            className="inline-flex items-center gap-1 rounded border border-rule bg-parchment-soft px-2 py-0.5 font-display text-[10px] uppercase tracking-wider text-brass-deep hover:border-brass-deep"
            title="Copy full RAG prompt (Markdown + JSON + Task)"
          >
            {copied ? <Check size={10} /> : <Copy size={10} />}
            {copied ? 'Copied RAG Prompt' : 'Copy RAG Prompt'}
          </button>
        </div>
      </div>

      {/* Active Context Selector Row */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <label className="mb-0.5 block font-display text-[10px] uppercase tracking-wider text-brass-deep">
            Grounded Scene Location
          </label>
          <select
            value={activeLocId}
            onChange={(e) => handleLocChange(e.target.value)}
            className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-xs text-ink"
          >
            {locations.length === 0 ? (
              <option value="">No Locations Prepped Yet</option>
            ) : (
              locations.map((l, idx) => {
                const lid = l.id || `loc-${idx}`;
                return (
                  <option key={lid} value={lid}>
                    {l.name || `Location ${idx + 1}`} {l.lighting ? `(${l.lighting})` : ''}
                  </option>
                );
              })
            )}
          </select>
        </div>

        <div>
          <label className="mb-0.5 block font-display text-[10px] uppercase tracking-wider text-brass-deep">
            Target Monster CR
          </label>
          <select
            value={targetCr}
            onChange={(e) => setTargetCr(e.target.value)}
            className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-xs text-ink"
          >
            {CR_OPTIONS.map((o) => (
              <option key={o.label} value={o.label}>
                CR {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-0.5 block font-display text-[10px] uppercase tracking-wider text-brass-deep">
            Optional GM Directive / Name
          </label>
          <input
            type="text"
            value={customNotes}
            onChange={(e) => setCustomNotes(e.target.value)}
            placeholder="e.g. Smuggler ambush, Cursed lantern…"
            className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-xs text-ink placeholder:italic placeholder:text-ink-faint focus:border-crimson focus:outline-none"
          />
        </div>
      </div>

      {/* Injected Context Summary Pills */}
      <div className="flex flex-wrap items-center gap-1.5 rounded border border-rule/70 bg-parchment-soft/70 px-2.5 py-1.5 font-serif text-[11px] text-ink-soft">
        <span className="font-display text-[9px] uppercase tracking-wider text-brass-deep">
          Injected RAG Nodes:
        </span>
        <span className="rounded border border-rule bg-parchment px-1.5 py-0.5">
          📍 {bundle.jsonContext.location?.name || 'Default Scene'}
        </span>
        <span className="rounded border border-rule bg-parchment px-1.5 py-0.5">
          👤 {bundle.jsonContext.linkedNpcs.length} Linked NPCs
        </span>
        <span className="rounded border border-rule bg-parchment px-1.5 py-0.5">
          ⚑ {bundle.jsonContext.linkedFactions.length} Factions
        </span>
        <span className="rounded border border-rule bg-parchment px-1.5 py-0.5">
          ⏱ {bundle.jsonContext.factionClocks.length} Clocks (Day {bundle.jsonContext.worldState.inWorldDay})
        </span>
      </div>

      {/* Collapsible Raw Markdown / JSON Context Viewer */}
      {contextTab !== 'none' && (
        <div className="rounded border border-brass/50 bg-parchment-deep/50 p-2.5">
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-ink">
            {contextTab === 'json'
              ? JSON.stringify(bundle.jsonContext, null, 2)
              : bundle.markdownContext}
          </pre>
        </div>
      )}

      {/* 1-Click Generation Buttons */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => handleOneClickSynthesize('rumors')}
          className={`flex items-center justify-center gap-1.5 rounded border px-2.5 py-2 font-display text-[10px] uppercase tracking-wider transition-colors ${
            result?.mode === 'rumors'
              ? 'border-crimson bg-crimson text-parchment'
              : 'border-rule bg-parchment-soft text-ink hover:border-crimson hover:text-crimson'
          }`}
        >
          <MessageSquareQuote size={13} /> 1-Click Tavern Rumors
        </button>

        <button
          type="button"
          onClick={() => handleOneClickSynthesize('deltas')}
          className={`flex items-center justify-center gap-1.5 rounded border px-2.5 py-2 font-display text-[10px] uppercase tracking-wider transition-colors ${
            result?.mode === 'deltas'
              ? 'border-crimson bg-crimson text-parchment'
              : 'border-rule bg-parchment-soft text-ink hover:border-crimson hover:text-crimson'
          }`}
        >
          <CalendarClock size={13} /> 1-Click Session Deltas
        </button>

        <button
          type="button"
          onClick={() => handleOneClickSynthesize('statblock')}
          className={`flex items-center justify-center gap-1.5 rounded border px-2.5 py-2 font-display text-[10px] uppercase tracking-wider transition-colors ${
            result?.mode === 'statblock'
              ? 'border-crimson bg-crimson text-parchment'
              : 'border-rule bg-parchment-soft text-ink hover:border-crimson hover:text-crimson'
          }`}
        >
          <Swords size={13} /> 1-Click 5e Stat Block
        </button>

        <button
          type="button"
          onClick={() => handleOneClickSynthesize('item')}
          className={`flex items-center justify-center gap-1.5 rounded border px-2.5 py-2 font-display text-[10px] uppercase tracking-wider transition-colors ${
            result?.mode === 'item'
              ? 'border-crimson bg-crimson text-parchment'
              : 'border-rule bg-parchment-soft text-ink hover:border-crimson hover:text-crimson'
          }`}
        >
          <Gift size={13} /> 1-Click Custom Item
        </button>
      </div>

      {/* Optional Pro Claude AI Enhancement */}
      {!compact && isPro && (
        <div className="flex items-center justify-end">
          <button
            type="button"
            disabled={aiLoading}
            onClick={handleClaudeGenerate}
            className="inline-flex items-center gap-1.5 rounded border border-wine/60 bg-wine/10 px-2.5 py-1 font-display text-[10px] uppercase tracking-wider text-wine hover:bg-wine hover:text-parchment disabled:opacity-50"
          >
            <Wand2 size={11} />
            {aiLoading ? 'Synthesizing with Claude…' : `Deep-Synthesize ${mode.toUpperCase()} with Claude`}
          </button>
        </div>
      )}

      {aiError && (
        <div className="rounded border border-crimson/50 bg-crimson/10 px-3 py-1.5 font-serif text-xs text-crimson">
          {aiError}
        </div>
      )}

      {/* Output Card */}
      {result && (
        <div className="space-y-2.5 rounded border border-brass-deep/60 bg-parchment-soft p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-2">
            <span className="font-display text-xs uppercase tracking-wider text-brass-deep">
              Canon-Grounded Output ({result.mode.toUpperCase()})
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSaveResultToCampaign}
                className="inline-flex items-center gap-1 rounded border border-moss bg-moss px-2.5 py-1 font-display text-[10px] uppercase tracking-wider text-parchment hover:bg-moss/90"
              >
                <PlusCircle size={11} /> Save to Campaign
              </button>
            </div>
          </div>

          {savedBanner && (
            <div className="rounded border border-moss/40 bg-moss/10 px-2.5 py-1 font-serif text-xs text-moss">
              {savedBanner}
            </div>
          )}

          <div className="whitespace-pre-wrap font-serif text-xs leading-relaxed text-ink">
            <MentionText text={result.markdown} campaignData={state} />
          </div>
        </div>
      )}
    </section>
  );
}
