'use client';

import React from 'react';
import { Map, Swords, Gift, Calendar, Plus } from 'lucide-react';
import { BookQuote, SoloNote, Pitfall, Section, ListField, Field, InspireGroup, Inspire, TargetBar, NPCCard, LocationCard } from '../prepPrimitives';
import { Phase } from '../phase';
import { EncounterHelper } from '../EncounterHelper';
import { TARGETS, countFilled } from '@/lib/prepTargets';
import { SECTION_GENERATORS, getLastUsed } from '@/lib/generators/sectionMap';
import { makeLogId } from '@/lib/campaign/migrations';
import { parseMonsterName } from '@/lib/sessionLog';
import { makeEntityId } from '@/lib/playerMode/share';
import StrongStartPicker from '../../StrongStartPicker';
import SummonButton from '../../SummonButton';
import type { EncounterCalcState } from '../prepTypes';
import { type CampaignEditorModel } from '../useCampaignEditor';

interface SessionPrepPhaseProps {
  ed: Pick<CampaignEditorModel,
    | 'done' | 'get' | 'getFilteredPrepArray' | 'highlightEntityId' | 'open' | 'phaseOpen'
    | 'setVal' | 'setSummonState' | 'state' | 'toggleDone' | 'toggleOpen' | 'togglePhase'
    | 'tgt' | 'trackEvent' | 'usedPrep'
  >;
}

export function SessionPrepPhase({ ed }: SessionPrepPhaseProps) {
  const {
    done, get, getFilteredPrepArray, highlightEntityId, open, phaseOpen,
    setVal, setSummonState, state, toggleDone, toggleOpen, togglePhase,
    tgt, trackEvent, usedPrep,
  } = ed;
  return (
    <Phase n="3" title="Per-Session Prep" sub="Lazy DM 8-Step Checklist" methods={['shea']} audience="solo" icon={Calendar} expanded={phaseOpen.p3} onToggle={() => togglePhase('p3')}>
      <BookQuote source="Lazy DM (Jeremy Crawford)">Prep as little as you can.</BookQuote>
      <Section id="s1-review" title="1 · Review the Characters" methods={['shea']} done={done['s1-review']} onToggle={toggleDone} open={open['s1-review']} onToggleOpen={toggleOpen}>
        <Field value={get('reviewNotes', '')} onChange={(v) => setVal('reviewNotes', v)} placeholder="Mental priming notes" rows={3} />
      </Section>
      <Section id="s2-start" title="2 · Create a Strong Start" methods={['shea']} done={done['s2-start']} onToggle={toggleDone} open={open['s2-start']} onToggleOpen={toggleOpen}>
        <SoloNote>Solo level-1 cannot reliably survive opening combat. Substitute action that isn&apos;t a losable fight.</SoloNote>
        <TargetBar current={countFilled('strongStart', get('strongStart', ''))} target={tgt('strongStart')} source={TARGETS.strongStart.source} />
        <Field value={get('strongStart', '')} onChange={(v) => setVal('strongStart', v)} placeholder="One sentence or paragraph" rows={4} />
        <InspireGroup>
          <Inspire tableId="introductions" label="Introduction" onPick={(e) => {
            const cur = (get('strongStart', '') as string).trim();
            if (cur && !confirm('Replace the current strong start?')) return;
            setVal('strongStart', e);
          }} />
          <StrongStartPicker onUse={(body) => {
            const cur = (get('strongStart', '') as string).trim();
            if (cur && !confirm('Replace the current strong start?')) return;
            setVal('strongStart', body);
          }} />
        </InspireGroup>
      </Section>
      <Section id="s3-scenes" title="3 · Outline Potential Scenes" methods={['shea']} done={done['s3-scenes']} onToggle={toggleDone} open={open['s3-scenes']} onToggleOpen={toggleOpen}>
        <BookQuote source="Lazy DM (Perkins)">Be prepared to throw what you have away.</BookQuote>
        <ListField
          items={(get('scenes', []) as string[]).filter(s => !usedPrep.usedScenes.has(s.trim()))}
          onChange={(v) => {
            const used = (get('scenes', []) as string[]).filter(s => usedPrep.usedScenes.has(s.trim()));
            setVal('scenes', [...used, ...v]);
          }}
          placeholder="A scene"
          target={tgt('scenes')}
        />
        <InspireGroup>
          <span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">Inspire:</span>
          <Inspire tableId="sideQuests" label="Side Quest" onPick={(e) => {
            setVal('scenes', [...(get('scenes', []) as string[]), e]);
          }} />
          <Inspire tableId="sideComplications" label="Complication" onPick={(e) => {
            setVal('scenes', [...(get('scenes', []) as string[]), e]);
          }} />
        </InspireGroup>
      </Section>
      <Section id="s4-secrets" title="4 · Define Secrets & Clues" methods={['shea']} done={done['s4-secrets']} onToggle={toggleDone} open={open['s4-secrets']} onToggleOpen={toggleOpen}>
        <BookQuote source="Lazy DM ch. 6">Secrets and clues are the connective tissue of an adventure.</BookQuote>
        <Pitfall>Tying a secret to a specific NPC means if players skip them, the secret never surfaces.</Pitfall>
        <ListField
          items={(get('secrets', []) as string[]).filter(s => !usedPrep.usedSecrets.has(s.trim()))}
          onChange={(v) => {
            const used = (get('secrets', []) as string[]).filter(s => usedPrep.usedSecrets.has(s.trim()));
            setVal('secrets', [...used, ...v]);
          }}
          placeholder="A single-sentence secret"
          rows={2}
          target={tgt('secrets')}
        />
        <InspireGroup>
          <span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">Inspire:</span>
          <Inspire tableId="villainSchemes" label="Scheme" onPick={(e) => {
            setVal('secrets', [...(get('secrets', []) as string[]), e]);
          }} />
          <Inspire tableId="villainWeaknesses" label="Weakness" onPick={(e) => {
            setVal('secrets', [...(get('secrets', []) as string[]), e]);
          }} />
          <Inspire tableId="campaignEvents" label="Event" onPick={(e) => {
            setVal('secrets', [...(get('secrets', []) as string[]), e]);
          }} />
        </InspireGroup>
      </Section>
      <Section id="s5-loc" title="5 · Develop Fantastic Locations" methods={['shea']} done={done['s5-loc']} onToggle={toggleDone} open={open['s5-loc']} onToggleOpen={toggleOpen} icon={Map}>
        <BookQuote source="Lazy DM ch. 7">When in doubt, go for scale.</BookQuote>
        <TargetBar current={countFilled('locations', getFilteredPrepArray('locations', get('locations', [])), get('player', {}))} target={tgt('locations')} source={TARGETS.locations.source} />
        {(get('locations', []) as any[])
          .map((l: any, originalIndex: number) => ({ l, originalIndex }))
          .filter(({ l }) => !usedPrep.linkedLocIds.has(l.id) && !usedPrep.linkedLocNames.has(l.name))
          .map(({ l, originalIndex }) => {
            const entityId = l?.id ?? `loc-${originalIndex}`;
            const highlighted = highlightEntityId === entityId;
            const playerConfig = get('player', {});
            const isShared = l.isPublic === true ||
              playerConfig?.entityVisibility?.locations?.[l.id]?.mode === 'party' ||
              playerConfig?.entityVisibility?.locations?.[l.id]?.mode === 'custom';
            return (
              <div
                key={originalIndex}
                id={`entity-${entityId}`}
                data-cp-anchor={`location:${originalIndex}`}
                className={`rounded transition-shadow ${
                  highlighted ? 'ring-2 ring-crimson ring-offset-2 ring-offset-parchment-soft' : ''
                } ${
                  isShared ? 'border border-moss/20 bg-moss/5 ring-1 ring-moss/30' : ''
                }`}
              >
                <LocationCard
                  data={l}
                  onChange={(v: any) => {
                    const next = [...(get('locations', []) as any[])];
                    next[originalIndex] = v;
                    setVal('locations', next);

                    // Synchronize playerConfig.entityVisibility
                    const curConfig = get('player', {});
                    const ev = { ...(curConfig.entityVisibility ?? {}) };
                    const bucket = { ...(ev.locations ?? {}) };
                    if (v.isPublic) {
                      bucket[l.id] = { mode: 'party' };
                    } else {
                      delete bucket[l.id];
                    }
                    ev.locations = bucket;
                    setVal('player', { ...curConfig, entityVisibility: ev });
                  }}
                  onRemove={() => setVal('locations', (get('locations', []) as any[]).filter((_: any, j: number) => j !== originalIndex))}
                />
              </div>
            );
          })}
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => {
            setVal('locations', [...(get('locations', []) as any[]), { id: makeEntityId(), name: '', type: '', aspects: ['', '', ''], factions: '' }]);
            trackEvent('location_added', 'Added a new location');
          }} className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:text-crimson">
            <Plus size={12} /> Add Location
          </button>
          {SECTION_GENERATORS.locations.length > 0 && (() => {
            const lastUsed = getLastUsed(state, 'locations');
            if (!lastUsed) return null;
            return (
              <SummonButton
                section="locations"
                lastUsed={lastUsed}
                options={SECTION_GENERATORS.locations}
                onSummon={(meta) => setSummonState({ section: 'locations', generator: meta })}
              />
            );
          })()}
        </div>
      </Section>
      <Section id="s6-npc" title="6 · Outline Important NPCs" methods={['shea', 'pr']} done={done['s6-npc']} onToggle={toggleDone} open={open['s6-npc']} onToggleOpen={toggleOpen}>
        <BookQuote source="PR ch. 3">Villains form goals in response to PC goals.</BookQuote>
        <TargetBar current={countFilled('npcs', getFilteredPrepArray('npcs', get('npcs', [])), get('player', {}))} target={tgt('npcs')} source={TARGETS.npcs.source} />
        {(get('npcs', []) as any[])
          .map((n: any, originalIndex: number) => ({ n, originalIndex }))
          .filter(({ n }) => !usedPrep.linkedNpcIds.has(n.id) && !usedPrep.linkedNpcNames.has(n.name))
          .map(({ n, originalIndex }) => {
            const entityId = n?.id ?? `npc-${originalIndex}`;
            const highlighted = highlightEntityId === entityId;
            const playerConfig = get('player', {});
            const isShared = n.isPublic === true ||
              playerConfig?.entityVisibility?.npcs?.[n.id]?.mode === 'party' ||
              playerConfig?.entityVisibility?.npcs?.[n.id]?.mode === 'custom';
            return (
              <div
                key={originalIndex}
                id={`entity-${entityId}`}
                data-cp-anchor={`npc:${originalIndex}`}
                className={`rounded transition-shadow ${
                  highlighted ? 'ring-2 ring-crimson ring-offset-2 ring-offset-parchment-soft' : ''
                } ${
                  isShared ? 'border border-moss/20 bg-moss/5 ring-1 ring-moss/30' : ''
                }`}
              >
                <NPCCard
                  data={n}
                  onChange={(v: any) => {
                    const next = [...(get('npcs', []) as any[])];
                    next[originalIndex] = v;
                    setVal('npcs', next);

                    // Synchronize playerConfig.entityVisibility
                    const curConfig = get('player', {});
                    const ev = { ...(curConfig.entityVisibility ?? {}) };
                    const bucket = { ...(ev.npcs ?? {}) };
                    if (v.isPublic) {
                      bucket[n.id] = { mode: 'party' };
                    } else {
                      delete bucket[n.id];
                    }
                    ev.npcs = bucket;
                    setVal('player', { ...curConfig, entityVisibility: ev });
                  }}
                  onRemove={() => setVal('npcs', (get('npcs', []) as any[]).filter((_: any, j: number) => j !== originalIndex))}
                />
              </div>
            );
          })}
        <InspireGroup>
          <span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">Add new NPC seeded by:</span>
          <Inspire tableId="villainArchetypes" label="Villain" onPick={(e) => {
            setVal('npcs', [...(get('npcs', []) as any[]), { id: makeEntityId(), name: '', type: 'Villain', faction: '', archetype: e, goal: '', method: '' }]);
          }} />
          <Inspire tableId="npcBackgroundConcepts" label="Background" onPick={(e) => {
            setVal('npcs', [...(get('npcs', []) as any[]), { id: makeEntityId(), name: '', type: '', faction: '', archetype: e, goal: '', method: '' }]);
          }} />
          <Inspire tableId="raceCharacterNotes" label="Species" onPick={(e) => {
            setVal('npcs', [...(get('npcs', []) as any[]), { id: makeEntityId(), name: '', type: '', faction: '', archetype: e, goal: '', method: '' }]);
          }} />
        </InspireGroup>
        <p className="-mt-1 font-serif text-[10px] italic text-ink-mute">
          Trait inspirations (mannerism, talent, ideal, bond, etc.) live inside each NPC card under &quot;Show Details&quot;.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => {
            setVal('npcs', [...(get('npcs', []) as any[]), { id: makeEntityId(), name: '', type: '', faction: '', archetype: '', goal: '', method: '' }]);
            trackEvent('npc_added', 'Added a new NPC');
          }} className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:text-crimson">
            <Plus size={12} /> Add NPC
          </button>
          {SECTION_GENERATORS.npcs.length > 0 && (() => {
            const lastUsed = getLastUsed(state, 'npcs');
            if (!lastUsed) return null;
            return (
              <SummonButton
                section="npcs"
                lastUsed={lastUsed}
                options={SECTION_GENERATORS.npcs}
                onSummon={(meta) => setSummonState({ section: 'npcs', generator: meta })}
              />
            );
          })()}
        </div>
      </Section>
      <Section id="s7-mon" title="7 · Choose Relevant Monsters" methods={['shea']} done={done['s7-mon']} onToggle={toggleDone} open={open['s7-mon']} onToggleOpen={toggleOpen} icon={Swords}>
        <SoloNote>Solo level-1 ~8-12 HP. CR 1/8 one-at-a-time. Narrative outs always.</SoloNote>
        <ListField
          items={(get('monsters', []) as string[]).filter(m => !usedPrep.linkedMonsterIds.has(m) && !usedPrep.linkedMonsterNames.has(parseMonsterName(m)))}
          onChange={(v) => {
            const used = (get('monsters', []) as string[]).filter(m => usedPrep.linkedMonsterIds.has(m) || usedPrep.linkedMonsterNames.has(parseMonsterName(m)));
            setVal('monsters', [...used, ...v]);
          }}
          placeholder="Monster — CR — use case"
          target={tgt('monsters')}
          rowIdFor={(i) => `monsters-${i}`}
          highlightId={highlightEntityId}
          isShared={(i) => {
            const visibleMonsters = (get('monsters', []) as string[]).filter(m => !usedPrep.linkedMonsterIds.has(m) && !usedPrep.linkedMonsterNames.has(parseMonsterName(m)));
            const m = visibleMonsters[i];
            if (!m) return false;
            const name = typeof m === 'string' ? m.split(' — ')[0] : (m as any).name || '';
            const playerLog = (get('playerLog', []) as any[]) || [];
            return playerLog.some(entry => entry.text && entry.text.includes(`Encountered: ${name}`));
          }}
          onToggleShare={(i) => {
            const visibleMonsters = (get('monsters', []) as string[]).filter(m => !usedPrep.linkedMonsterIds.has(m) && !usedPrep.linkedMonsterNames.has(parseMonsterName(m)));
            const m = visibleMonsters[i];
            if (!m) return;
            const name = typeof m === 'string' ? m.split(' — ')[0] : (m as any).name || '';
            const playerLog = (get('playerLog', []) as any[]) || [];
            const isCurrentlyShared = playerLog.some(entry => entry.text && entry.text.includes(`Encountered: ${name}`));

            if (isCurrentlyShared) {
              // Remove it from playerLog
              const nextLog = playerLog.filter(entry => !(entry.text && entry.text.includes(`Encountered: ${name}`)));
              setVal('playerLog', nextLog);
            } else {
              // Add it to playerLog
              const nextLog = [...playerLog, {
                id: makeLogId(),
                text: `Encountered: ${name}`,
                mentions: [],
                visibility: { mode: 'party' },
                authorRef: 'gm',
                postedAtMs: Date.now(),
              }];
              setVal('playerLog', nextLog);
            }
          }}
        />
        {SECTION_GENERATORS.monsters.length > 0 && (() => {
          const lastUsed = getLastUsed(state, 'monsters');
          if (!lastUsed) return null;
          return (
            <div className="flex">
              <SummonButton
                section="monsters"
                lastUsed={lastUsed}
                options={SECTION_GENERATORS.monsters}
                onSummon={(meta) => setSummonState({ section: 'monsters', generator: meta })}
              />
            </div>
          );
        })()}
        <EncounterHelper
          state={(get('__encounterCalc', { pcLevel: 1, monsters: [] })) as EncounterCalcState}
          onChange={(s) => setVal('__encounterCalc', s)}
        />
      </Section>
      <Section id="s8-rew" title="8 · Select Magic Item Rewards" methods={['shea', 'pr']} done={done['s8-rew']} onToggle={toggleDone} open={open['s8-rew']} onToggleOpen={toggleOpen} icon={Gift}>
        <BookQuote source="PR ch. 6">Your +1 needs to be actionable.</BookQuote>
        <TargetBar current={countFilled('items', getFilteredPrepArray('items', get('items', [])), get('player', {}))} target={tgt('items')} source={TARGETS.items.source} />
        {(() => {
          const allItems = (get('items', []) as any[]) || [];
          const assignedItems = allItems.filter(item => {
            if (typeof item === 'object' && item) {
              const isAssigned = !!item.assignedPlayerId;
              const id = String(item.id || '').trim();
              const name = String(item.name || '').trim();
              const isLinked = usedPrep.linkedLootIds.has(id) || usedPrep.linkedLootNames.has(name);
              return isAssigned || isLinked;
            }
            if (typeof item === 'string') {
              const trimmed = item.trim();
              const isLinked = usedPrep.linkedLootIds.has(trimmed) || usedPrep.linkedLootNames.has(trimmed);
              return isLinked;
            }
            return false;
          });
          const visibleItems = allItems.filter(item => {
            if (typeof item === 'object' && item) {
              const isAssigned = !!item.assignedPlayerId;
              const id = String(item.id || '').trim();
              const name = String(item.name || '').trim();
              const isLinked = usedPrep.linkedLootIds.has(id) || usedPrep.linkedLootNames.has(name);
              return !isAssigned && !isLinked;
            }
            if (typeof item === 'string') {
              const trimmed = item.trim();
              const isLinked = usedPrep.linkedLootIds.has(trimmed) || usedPrep.linkedLootNames.has(trimmed);
              return !isLinked;
            }
            return true;
          });
          return (
            <ListField
              items={visibleItems}
              onChange={(nextUnassigned) => setVal('items', [...assignedItems, ...nextUnassigned])}
              placeholder="Item · what +1 hook it delivers"
              rows={2}
              target={tgt('items')}
              rowIdFor={(i) => `items-${i}`}
              highlightId={highlightEntityId}
            />
          );
        })()}
        {SECTION_GENERATORS.magicItems.length > 0 && (() => {
          const lastUsed = getLastUsed(state, 'magicItems');
          if (!lastUsed) return null;
          return (
            <div className="flex">
              <SummonButton
                section="magicItems"
                lastUsed={lastUsed}
                options={SECTION_GENERATORS.magicItems}
                onSummon={(meta) => setSummonState({ section: 'magicItems', generator: meta })}
              />
            </div>
          );
        })()}
        <div className="border-t border-rule/60 pt-3">
          <p className="mb-1.5 font-display text-xs uppercase tracking-wider text-brass-deep">Treasure</p>
          <p className="mb-1.5 font-serif text-[11px] italic text-ink-mute">
            Coins, gems, art, trinkets, and other rewards — generated entries land here.
          </p>
          <ListField
            items={(get('treasure', []) as string[]).filter(t => !usedPrep.linkedLootIds.has(t.trim()) && !usedPrep.linkedLootNames.has(t.trim()))}
            onChange={(v) => {
              const used = (get('treasure', []) as string[]).filter(t => usedPrep.linkedLootIds.has(t.trim()) || usedPrep.linkedLootNames.has(t.trim()));
              setVal('treasure', [...used, ...v]);
            }}
            placeholder="Treasure item — coins · gem · art · trinket"
            rows={2}
            rowIdFor={(i) => `treasure-${i}`}
            highlightId={highlightEntityId}
          />
        </div>
      </Section>
    </Phase>
  );
}
