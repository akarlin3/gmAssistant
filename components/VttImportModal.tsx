'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
  Upload,
  X,
  Lock,
  ShieldCheck,
  Check,
  AlertTriangle,
  FileJson,
  FileText,
  Sparkles,
} from 'lucide-react';
import {
  applyVttImportToCampaign,
  parseVttExport,
  type VttImportSelection,
} from '@/lib/vttImporter';

const SAMPLE_MARKDOWN_STATBLOCK = `## Shadowblade Hobgoblin Captain
*Medium humanoid (goblinoid), lawful evil*
___
- **Armor Class** 17 (half plate)
- **Hit Points** 39 (6d8 + 12)
- **Speed** 30 ft.
___
|STR|DEX|CON|INT|WIS|CHA|
|:---:|:---:|:---:|:---:|:---:|:---:|
|15 (+2)|14 (+2)|14 (+2)|12 (+1)|10 (+0)|13 (+1)|
___
- **Damage Resistances** necrotic
- **Senses** darkvision 60 ft., passive Perception 10
- **Languages** Common, Goblin
- **Challenge** 3
___
***Martial Advantage.*** Once per turn, deals an extra 10 (3d6) damage to a creature within 5 ft. of an ally.

### Actions
***Multiattack.*** Makes two greatsword attacks.

***Shadow Greatsword.*** *Melee Weapon Attack:* +4 to hit, reach 5 ft., one target. *Hit:* 9 (2d6 + 2) slashing damage.

***Shadow Burst (Recharge 5-6).*** Each creature within 15 ft. must make a DC 13 Constitution saving throw, taking 14 (4d6) necrotic damage on a failed save, or half as much on a successful one.`;

const SAMPLE_FOUNDRY_ACTOR = JSON.stringify(
  {
    name: 'Crypt Guardian Construct',
    type: 'npc',
    system: {
      abilities: {
        str: { value: 18 },
        dex: { value: 9 },
        con: { value: 18 },
        int: { value: 6 },
        wis: { value: 11 },
        cha: { value: 5 },
      },
      attributes: {
        ac: { value: 17 },
        hp: { value: 68, max: 68, formula: '8d10+24' },
        movement: { walk: 30 },
      },
      details: {
        cr: 4,
        type: { value: 'construct' },
        alignment: 'unaligned',
        biography: { value: '<p>An ancient bronze sentinel bound to the vault doors.</p>' },
      },
      traits: {
        size: 'lg',
        di: { value: ['poison', 'psychic'] },
      },
    },
    items: [
      {
        name: 'Bronze Slam',
        type: 'weapon',
        system: {
          activation: { type: 'action' },
          description: {
            value: '<p>Melee Weapon Attack: +6 to hit, reach 5 ft., one target. Hit: 13 (2d8 + 4) bludgeoning damage.</p>',
          },
          damage: { parts: [['2d8+4', 'bludgeoning']] },
        },
      },
    ],
  },
  null,
  2,
);

export interface VttImportModalProps {
  open: boolean;
  onClose: () => void;
  campaignId: string;
  campaignName: string;
  campaignData: Record<string, any>;
  onApplyCampaignData: (nextData: Record<string, any>, summaryMessage: string) => void;
}

export function VttImportModal({
  open,
  onClose,
  campaignId,
  campaignName,
  campaignData,
  onApplyCampaignData,
}: VttImportModalProps) {
  const [rawInput, setRawInput] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [selection, setSelection] = useState<VttImportSelection>({
    includePcs: true,
    includeNpcs: true,
    includeMonsters: true,
    includeCombatants: true,
    includeLocations: true,
    includeMaps: true,
    includeItems: true,
    includeSecrets: true,
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const preview = useMemo(() => {
    if (!rawInput.trim()) return null;
    return parseVttExport(rawInput);
  }, [rawInput]);

  if (!open) return null;

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setRawInput(text);
  };

  const totalEntities = preview
    ? preview.pcs.length +
      preview.npcs.length +
      preview.monsters.length +
      preview.combatants.length +
      preview.locations.length +
      preview.maps.length +
      preview.items.length
    : 0;

  const handleMerge = () => {
    if (!preview || totalEntities === 0) return;
    const { nextState, importedCounts } = applyVttImportToCampaign({
      campaignId,
      campaignName,
      currentState: campaignData,
      preview,
      selection,
      captureSnapshot: true,
    });

    const parts: string[] = [];
    if (importedCounts.pcs > 0) parts.push(`${importedCounts.pcs} PC(s)`);
    if (importedCounts.monsters > 0) parts.push(`${importedCounts.monsters} Monster(s)`);
    if (importedCounts.combatants > 0) parts.push(`${importedCounts.combatants} Combatant(s)`);
    if (importedCounts.npcs > 0) parts.push(`${importedCounts.npcs} NPC(s)`);
    if (importedCounts.locations > 0) parts.push(`${importedCounts.locations} Location(s)`);
    if (importedCounts.maps > 0) parts.push(`${importedCounts.maps} Map(s)`);
    if (importedCounts.items > 0) parts.push(`${importedCounts.items} Item(s)`);

    onApplyCampaignData(
      nextState,
      `Imported ${parts.join(', ')} (${preview.formatLabel} · 🔒 Default Private · Backup saved to Vault)`,
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Universal VTT & Encounter Importer"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3.5">
          <div>
            <div className="flex items-center gap-2">
              <Upload size={16} className="text-[var(--accent-primary)]" />
              <h2 className="font-display text-base font-bold">
                Universal VTT &amp; Encounter Importer
              </h2>
            </div>
            <p className="mt-0.5 font-sans text-xs text-[var(--text-muted)]">
              Foundry VTT (Actor / Item / Scene / Journal), D&amp;D Beyond, Open5e, 5etools, Roll20, Kobold+, or Markdown Statblocks
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close VTT Importer"
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text-primary)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Privacy & Safety Vault Guarantees */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs">
            <div className="flex items-center gap-1.5 text-amber-200">
              <Lock size={13} className="shrink-0 text-amber-400" />
              <span>
                <strong>Default Visibility: Private.</strong> Imported monsters, traps, maps &amp; NPCs never leak to <code>/player</code> until revealed.
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-300">
              <ShieldCheck size={13} className="shrink-0" />
              <span>Auto-Snapshot Backup</span>
            </div>
          </div>

          {/* File Upload + Sample Loaders */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.md,.txt,.markdown"
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 font-sans text-xs font-semibold hover:border-[var(--accent-primary)]"
              >
                <FileJson size={13} className="text-[var(--accent-primary)]" />
                <span>{fileName ? `Loaded: ${fileName}` : 'Upload .json / .md File'}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setFileName(null);
                  setRawInput(SAMPLE_MARKDOWN_STATBLOCK);
                }}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2 py-1 font-sans text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <FileText size={11} />
                <span>Sample Markdown Statblock</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setFileName(null);
                  setRawInput(SAMPLE_FOUNDRY_ACTOR);
                }}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2 py-1 font-sans text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <Sparkles size={11} />
                <span>Sample Foundry Actor</span>
              </button>
            </div>
          </div>

          {/* Paste Area */}
          <div>
            <textarea
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              rows={7}
              placeholder="Paste Foundry VTT JSON, D&D Beyond Character/Encounter JSON, Open5e/5etools/Kobold+ JSON, or a 5e Markdown monster statblock here…"
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 font-mono text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
            />
          </div>

          {/* Live Normalization Preview */}
          {preview && (
            <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-sans text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Detected Schema:
                  </span>
                  <span className="rounded-full bg-[var(--accent-primary)]/20 px-2.5 py-0.5 font-sans text-xs font-bold text-[var(--accent-primary)]">
                    {preview.formatLabel}
                  </span>
                </div>
                <span className="font-mono text-xs text-[var(--text-muted)]">
                  {totalEntities} normalized record(s)
                </span>
              </div>

              {preview.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-200">
                  {preview.warnings.map((w, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <AlertTriangle size={13} className="shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Category Toggle Grid */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { key: 'includeMonsters' as const, label: 'Monsters', count: preview.monsters.length },
                  { key: 'includeCombatants' as const, label: 'Encounter Tracker', count: preview.combatants.length },
                  { key: 'includeNpcs' as const, label: 'NPCs', count: preview.npcs.length },
                  { key: 'includePcs' as const, label: 'PC Sheets', count: preview.pcs.length },
                  { key: 'includeMaps' as const, label: 'Scenes / Maps', count: preview.maps.length },
                  { key: 'includeLocations' as const, label: 'Locations / Lore', count: preview.locations.length },
                  { key: 'includeItems' as const, label: 'Items', count: preview.items.length },
                ]
                  .filter((c) => c.count > 0)
                  .map((cat) => (
                    <label
                      key={cat.key}
                      className="flex cursor-pointer items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs"
                    >
                      <span className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={selection[cat.key] !== false}
                          onChange={(e) =>
                            setSelection((s) => ({ ...s, [cat.key]: e.target.checked }))
                          }
                        />
                        <span>{cat.label}</span>
                      </span>
                      <span className="rounded bg-white/10 px-1.5 py-0.2 font-mono text-[10px] font-bold">
                        {cat.count}
                      </span>
                    </label>
                  ))}
              </div>

              {/* Sample Entity Preview List */}
              {totalEntities > 0 && (
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5 text-xs">
                  {preview.pcs.map((pc) => (
                    <div key={pc.id} className="flex items-center justify-between py-0.5">
                      <span>
                        <strong>[PC]</strong> {pc.name} — Lvl {pc.level}{' '}
                        {pc.classes.map((c) => c.name).join('/')} (AC {pc.ac}, HP {pc.hp.current}/{pc.hp.max})
                      </span>
                      <span className="text-[10px] text-amber-300">🔒 DM Owned</span>
                    </div>
                  ))}
                  {preview.monsters.map((m) => (
                    <div key={m.id} className="flex items-center justify-between py-0.5">
                      <span>
                        <strong>[Monster]</strong> {m.name} — CR {m.cr} · AC {m.ac} · HP {m.hp} ({m.hitDice}) · {m.actions.length} action(s)
                      </span>
                      <span className="text-[10px] text-amber-300">🔒 Private</span>
                    </div>
                  ))}
                  {preview.maps.map((mp) => (
                    <div key={mp.id} className="flex items-center justify-between py-0.5">
                      <span>
                        <strong>[Map]</strong> {mp.name} ({mp.width}x{mp.height}, {(mp.tokens ?? []).length} tokens, {(mp.traps ?? []).length} traps)
                      </span>
                      <span className="text-[10px] text-amber-300">🔒 Fog &amp; Layer Private</span>
                    </div>
                  ))}
                  {preview.locations.map((loc) => (
                    <div key={loc.id} className="flex items-center justify-between py-0.5">
                      <span>
                        <strong>[Location]</strong> {loc.name}
                      </span>
                      <span className="text-[10px] text-amber-300">🔒 Private</span>
                    </div>
                  ))}
                  {preview.items.map((it) => (
                    <div key={it.id} className="flex items-center justify-between py-0.5">
                      <span>
                        <strong>[Item]</strong> {it.name}
                      </span>
                      <span className="text-[10px] text-amber-300">🔒 Unassigned</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)]/60 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border-subtle)] px-3.5 py-1.5 font-sans text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!preview || totalEntities === 0}
            onClick={handleMerge}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-4 py-1.5 font-sans text-xs font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check size={14} />
            <span>Backup Snapshot &amp; Merge into Campaign</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default VttImportModal;
