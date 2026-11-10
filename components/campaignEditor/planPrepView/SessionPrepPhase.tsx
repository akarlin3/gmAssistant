'use client';

import React from 'react';
import { Map, Swords, Gift, Calendar, Plus, Sparkles, Users } from 'lucide-react';
import {
  BookQuote,
  SoloNote,
  Pitfall,
  Section,
  ListField,
  Field,
  InspireGroup,
  Inspire,
  TargetBar,
  NPCCard,
  LocationCard,
} from '../prepPrimitives';
import { Phase } from '../phase';
import { EncounterHelper } from '../EncounterHelper';
import { TARGETS, countFilled } from '@/lib/prepTargets';
import { SECTION_GENERATORS, getLastUsed } from '@/lib/generators/sectionMap';
import { makeLogId } from '@/lib/campaign/migrations';
import { parseMonsterName } from '@/lib/sessionLog';
import { makeEntityId } from '@/lib/playerMode/share';
import { sampleTable } from '@/lib/inspirationTables';
import StrongStartPicker from '../../StrongStartPicker';
import SummonButton from '../../SummonButton';
import { GuidedEmptyState } from '../../ui/GuidedEmptyState';
import type { EncounterCalcState } from '../prepTypes';
import { type CampaignEditorModel } from '../useCampaignEditor';

export type SessionPrepStepId =
  | 'all'
  | 's1-review'
  | 's2-start'
  | 's3-scenes'
  | 's4-secrets'
  | 's5-loc'
  | 's6-npc'
  | 's7-mon'
  | 's8-rew';

interface SessionPrepPhaseProps {
  ed: Pick<
    CampaignEditorModel,
    | 'done'
    | 'get'
    | 'getFilteredPrepArray'
    | 'highlightEntityId'
    | 'open'
    | 'phaseOpen'
    | 'setVal'
    | 'setSummonState'
    | 'state'
    | 'toggleDone'
    | 'toggleOpen'
    | 'togglePhase'
    | 'tgt'
    | 'trackEvent'
    | 'usedPrep'
  >;
  focusedStepId?: SessionPrepStepId;
  visibilityFilter?: 'all' | 'party' | 'private';
}

export function SessionPrepPhase({
  ed,
  focusedStepId = 'all',
  visibilityFilter = 'all',
}: SessionPrepPhaseProps) {
  const {
    done,
    get,
    getFilteredPrepArray,
    highlightEntityId,
    open,
    phaseOpen,
    setVal,
    setSummonState,
    state,
    toggleDone,
    toggleOpen,
    togglePhase,
    tgt,
    trackEvent,
    usedPrep,
  } = ed;

  const showStep = (id: SessionPrepStepId) =>
    focusedStepId === 'all' || focusedStepId === id;

  const isSectionOpen = (id: SessionPrepStepId) =>
    focusedStepId === id ? true : Boolean(open[id]);

  const matchesVisibilityFilter = (isShared: boolean) => {
    if (visibilityFilter === 'all') return true;
    if (visibilityFilter === 'party') return isShared;
    return !isShared;
  };

  const activeSecrets = (get('secrets', []) as string[]).filter(
    (s) => !usedPrep.usedSecrets.has(s.trim()),
  );

  const innerContent = (
    <div className="space-y-4">
      {focusedStepId === 'all' && (
        <BookQuote source="Lazy DM (Jeremy Crawford)">
          Prep as little as you can.
        </BookQuote>
      )}

      {showStep('s1-review') && (
        <Section
          id="s1-review"
          title="1 · Review the Characters"
          methods={['shea']}
          done={done['s1-review']}
          onToggle={toggleDone}
          open={isSectionOpen('s1-review')}
          onToggleOpen={toggleOpen}
        >
          <Field
            value={get('reviewNotes', '')}
            onChange={(v) => setVal('reviewNotes', v)}
            placeholder="Mental priming notes — character hooks, active bonds, unresolved threads"
            rows={4}
          />
        </Section>
      )}

      {showStep('s2-start') && (
        <Section
          id="s2-start"
          title="2 · Create a Strong Start"
          methods={['shea']}
          done={done['s2-start']}
          onToggle={toggleDone}
          open={isSectionOpen('s2-start')}
          onToggleOpen={toggleOpen}
        >
          <SoloNote>
            Solo level-1 cannot reliably survive opening combat. Substitute action
            that isn&apos;t a losable fight.
          </SoloNote>
          <TargetBar
            current={countFilled('strongStart', get('strongStart', ''))}
            target={tgt('strongStart')}
            source={TARGETS.strongStart.source}
          />
          <Field
            value={get('strongStart', '')}
            onChange={(v) => setVal('strongStart', v)}
            placeholder="Drop the party straight into motion at the top of the session…"
            rows={4}
          />
          <InspireGroup>
            <Inspire
              tableId="introductions"
              label="Introduction"
              onPick={(e) => {
                const cur = (get('strongStart', '') as string).trim();
                if (cur && !confirm('Replace the current strong start?')) return;
                setVal('strongStart', e);
              }}
            />
            <StrongStartPicker
              onUse={(body) => {
                const cur = (get('strongStart', '') as string).trim();
                if (cur && !confirm('Replace the current strong start?')) return;
                setVal('strongStart', body);
              }}
            />
          </InspireGroup>
        </Section>
      )}

      {showStep('s3-scenes') && (
        <Section
          id="s3-scenes"
          title="3 · Outline Potential Scenes"
          methods={['shea']}
          done={done['s3-scenes']}
          onToggle={toggleDone}
          open={isSectionOpen('s3-scenes')}
          onToggleOpen={toggleOpen}
        >
          <BookQuote source="Lazy DM (Perkins)">
            Be prepared to throw what you have away.
          </BookQuote>
          <ListField
            items={(get('scenes', []) as string[]).filter(
              (s) => !usedPrep.usedScenes.has(s.trim()),
            )}
            onChange={(v) => {
              const used = (get('scenes', []) as string[]).filter((s) =>
                usedPrep.usedScenes.has(s.trim()),
              );
              setVal('scenes', [...used, ...v]);
            }}
            placeholder="A potential scene or situation"
            target={tgt('scenes')}
          />
          <InspireGroup>
            <span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">
              Inspire:
            </span>
            <Inspire
              tableId="sideQuests"
              label="Side Quest"
              onPick={(e) => {
                setVal('scenes', [...(get('scenes', []) as string[]), e]);
              }}
            />
            <Inspire
              tableId="sideComplications"
              label="Complication"
              onPick={(e) => {
                setVal('scenes', [...(get('scenes', []) as string[]), e]);
              }}
            />
          </InspireGroup>
        </Section>
      )}

      {showStep('s4-secrets') && (
        <Section
          id="s4-secrets"
          title="4 · Define Secrets & Clues"
          methods={['shea']}
          done={done['s4-secrets']}
          onToggle={toggleDone}
          open={isSectionOpen('s4-secrets')}
          onToggleOpen={toggleOpen}
        >
          <BookQuote source="Lazy DM ch. 6">
            Secrets and clues are the connective tissue of an adventure.
          </BookQuote>
          <Pitfall>
            Tying a secret to a specific NPC means if players skip them, the
            secret never surfaces.
          </Pitfall>
          {activeSecrets.filter((s) => s.trim().length > 0).length === 0 && (
            <GuidedEmptyState
              icon={<Sparkles size={18} />}
              title="No Starting Secrets Defined Yet"
              description="Prepare 5–10 modular secrets and clues that players can uncover anywhere during the session."
              actions={[
                {
                  label: 'Generate Starting Secrets',
                  onClick: () => {
                    const seeds = [
                      ...sampleTable('villainSchemes', 2),
                      ...sampleTable('campaignEvents', 1),
                    ];
                    setVal('secrets', [
                      ...(get('secrets', []) as string[]).filter((s) => s.trim()),
                      ...seeds,
                    ]);
                  },
                  variant: 'primary',
                  icon: <Sparkles size={13} />,
                },
                {
                  label: 'Add Blank Secret',
                  onClick: () =>
                    setVal('secrets', [...(get('secrets', []) as string[]), '']),
                  variant: 'secondary',
                  icon: <Plus size={13} />,
                },
              ]}
            />
          )}
          <ListField
            items={activeSecrets}
            onChange={(v) => {
              const used = (get('secrets', []) as string[]).filter((s) =>
                usedPrep.usedSecrets.has(s.trim()),
              );
              setVal('secrets', [...used, ...v]);
            }}
            placeholder="A single-sentence secret"
            rows={2}
            target={tgt('secrets')}
          />
          <InspireGroup>
            <span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">
              Inspire:
            </span>
            <Inspire
              tableId="villainSchemes"
              label="Scheme"
              onPick={(e) => {
                setVal('secrets', [...(get('secrets', []) as string[]), e]);
              }}
            />
            <Inspire
              tableId="villainWeaknesses"
              label="Weakness"
              onPick={(e) => {
                setVal('secrets', [...(get('secrets', []) as string[]), e]);
              }}
            />
            <Inspire
              tableId="campaignEvents"
              label="Event"
              onPick={(e) => {
                setVal('secrets', [...(get('secrets', []) as string[]), e]);
              }}
            />
          </InspireGroup>
        </Section>
      )}

      {showStep('s5-loc') && (
        <Section
          id="s5-loc"
          title="5 · Develop Fantastic Locations"
          methods={['shea']}
          done={done['s5-loc']}
          onToggle={toggleDone}
          open={isSectionOpen('s5-loc')}
          onToggleOpen={toggleOpen}
          icon={Map}
        >
          <BookQuote source="Lazy DM ch. 7">
            When in doubt, go for scale.
          </BookQuote>
          <TargetBar
            current={countFilled(
              'locations',
              getFilteredPrepArray('locations', get('locations', [])),
              get('player', {}),
            )}
            target={tgt('locations')}
            source={TARGETS.locations.source}
          />
          {((get('locations', []) as any[]) || []).length === 0 && (
            <GuidedEmptyState
              icon={<Map size={18} />}
              title="No Fantastic Locations Yet"
              description="Add evocative locations with 3 sensory aspects and toggle 👁️ Party when the players arrive."
              actions={[
                {
                  label: 'Add Location',
                  onClick: () => {
                    setVal('locations', [
                      ...(get('locations', []) as any[]),
                      {
                        id: makeEntityId(),
                        name: '',
                        type: '',
                        aspects: ['', '', ''],
                        factions: '',
                      },
                    ]);
                    trackEvent('location_added', 'Added a new location');
                  },
                  variant: 'primary',
                  icon: <Plus size={13} />,
                },
              ]}
            />
          )}
          {(get('locations', []) as any[])
            .map((l: any, originalIndex: number) => ({ l, originalIndex }))
            .filter(
              ({ l }) =>
                !usedPrep.linkedLocIds.has(l.id) &&
                !usedPrep.linkedLocNames.has(l.name),
            )
            .filter(({ l }) => {
              const playerConfig = get('player', {});
              const isShared =
                l.isPublic === true ||
                l.player_visible === true ||
                l.visibility?.scope === 'party' ||
                playerConfig?.entityVisibility?.locations?.[l.id]?.mode === 'party' ||
                playerConfig?.entityVisibility?.locations?.[l.id]?.mode === 'custom';
              return matchesVisibilityFilter(isShared);
            })
            .map(({ l, originalIndex }) => {
              const entityId = l?.id ?? `loc-${originalIndex}`;
              const highlighted = highlightEntityId === entityId;
              return (
                <div
                  key={originalIndex}
                  id={`entity-${entityId}`}
                  data-cp-anchor={`location:${originalIndex}`}
                  className={`rounded transition-shadow ${
                    highlighted
                      ? 'ring-2 ring-[var(--accent-primary)] ring-offset-2'
                      : ''
                  }`}
                >
                  <LocationCard
                    data={l}
                    onChange={(v: any) => {
                      const next = [...(get('locations', []) as any[])];
                      next[originalIndex] = v;
                      setVal('locations', next);

                      const curConfig = get('player', {});
                      const ev = { ...(curConfig.entityVisibility ?? {}) };
                      const bucket = { ...(ev.locations ?? {}) };
                      if (v.isPublic || v.player_visible) {
                        bucket[l.id] = { mode: 'party' };
                      } else {
                        delete bucket[l.id];
                      }
                      ev.locations = bucket;
                      setVal('player', { ...curConfig, entityVisibility: ev });
                    }}
                    onRemove={() =>
                      setVal(
                        'locations',
                        (get('locations', []) as any[]).filter(
                          (_: any, j: number) => j !== originalIndex,
                        ),
                      )
                    }
                  />
                </div>
              );
            })}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setVal('locations', [
                  ...(get('locations', []) as any[]),
                  {
                    id: makeEntityId(),
                    name: '',
                    type: '',
                    aspects: ['', '', ''],
                    factions: '',
                  },
                ]);
                trackEvent('location_added', 'Added a new location');
              }}
              className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:text-crimson"
            >
              <Plus size={12} /> Add Location
            </button>
            {SECTION_GENERATORS.locations.length > 0 &&
              (() => {
                const lastUsed = getLastUsed(state, 'locations');
                if (!lastUsed) return null;
                return (
                  <SummonButton
                    section="locations"
                    lastUsed={lastUsed}
                    options={SECTION_GENERATORS.locations}
                    onSummon={(meta) =>
                      setSummonState({ section: 'locations', generator: meta })
                    }
                  />
                );
              })()}
          </div>
        </Section>
      )}

      {showStep('s6-npc') && (
        <Section
          id="s6-npc"
          title="6 · Outline Important NPCs"
          methods={['shea', 'pr']}
          done={done['s6-npc']}
          onToggle={toggleDone}
          open={isSectionOpen('s6-npc')}
          onToggleOpen={toggleOpen}
        >
          <BookQuote source="PR ch. 3">
            Villains form goals in response to PC goals.
          </BookQuote>
          <TargetBar
            current={countFilled(
              'npcs',
              getFilteredPrepArray('npcs', get('npcs', [])),
              get('player', {}),
            )}
            target={tgt('npcs')}
            source={TARGETS.npcs.source}
          />
          {((get('npcs', []) as any[]) || []).length === 0 && (
            <GuidedEmptyState
              icon={<Users size={18} />}
              title="No Campaign NPCs Outlined Yet"
              description="Create allies, patrons, rivals, and villains with active goals. Collapsed cards keep your workspace clean."
              actions={[
                {
                  label: 'Add NPC',
                  onClick: () => {
                    setVal('npcs', [
                      ...(get('npcs', []) as any[]),
                      {
                        id: makeEntityId(),
                        name: '',
                        type: '',
                        faction: '',
                        archetype: '',
                        goal: '',
                        method: '',
                      },
                    ]);
                    trackEvent('npc_added', 'Added a new NPC');
                  },
                  variant: 'primary',
                  icon: <Plus size={13} />,
                },
                {
                  label: 'Seed Villain Archetype',
                  onClick: () => {
                    const [seed] = sampleTable('villainArchetypes', 1);
                    setVal('npcs', [
                      ...(get('npcs', []) as any[]),
                      {
                        id: makeEntityId(),
                        name: '',
                        type: 'Villain',
                        faction: '',
                        archetype: seed || '',
                        goal: '',
                        method: '',
                      },
                    ]);
                  },
                  variant: 'secondary',
                  icon: <Sparkles size={13} />,
                },
              ]}
            />
          )}
          {(get('npcs', []) as any[])
            .map((n: any, originalIndex: number) => ({ n, originalIndex }))
            .filter(
              ({ n }) =>
                !usedPrep.linkedNpcIds.has(n.id) &&
                !usedPrep.linkedNpcNames.has(n.name),
            )
            .filter(({ n }) => {
              const playerConfig = get('player', {});
              const isShared =
                n.isPublic === true ||
                n.player_visible === true ||
                n.visibility?.scope === 'party' ||
                playerConfig?.entityVisibility?.npcs?.[n.id]?.mode === 'party' ||
                playerConfig?.entityVisibility?.npcs?.[n.id]?.mode === 'custom';
              return matchesVisibilityFilter(isShared);
            })
            .map(({ n, originalIndex }) => {
              const entityId = n?.id ?? `npc-${originalIndex}`;
              const highlighted = highlightEntityId === entityId;
              return (
                <div
                  key={originalIndex}
                  id={`entity-${entityId}`}
                  data-cp-anchor={`npc:${originalIndex}`}
                  className={`rounded transition-shadow ${
                    highlighted
                      ? 'ring-2 ring-[var(--accent-primary)] ring-offset-2'
                      : ''
                  }`}
                >
                  <NPCCard
                    data={n}
                    onChange={(v: any) => {
                      const next = [...(get('npcs', []) as any[])];
                      next[originalIndex] = v;
                      setVal('npcs', next);

                      const curConfig = get('player', {});
                      const ev = { ...(curConfig.entityVisibility ?? {}) };
                      const bucket = { ...(ev.npcs ?? {}) };
                      if (v.isPublic || v.player_visible) {
                        bucket[n.id] = { mode: 'party' };
                      } else {
                        delete bucket[n.id];
                      }
                      ev.npcs = bucket;
                      setVal('player', { ...curConfig, entityVisibility: ev });
                    }}
                    onRemove={() =>
                      setVal(
                        'npcs',
                        (get('npcs', []) as any[]).filter(
                          (_: any, j: number) => j !== originalIndex,
                        ),
                      )
                    }
                  />
                </div>
              );
            })}
          <InspireGroup>
            <span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">
              Add new NPC seeded by:
            </span>
            <Inspire
              tableId="villainArchetypes"
              label="Villain"
              onPick={(e) => {
                setVal('npcs', [
                  ...(get('npcs', []) as any[]),
                  {
                    id: makeEntityId(),
                    name: '',
                    type: 'Villain',
                    faction: '',
                    archetype: e,
                    goal: '',
                    method: '',
                  },
                ]);
              }}
            />
            <Inspire
              tableId="npcBackgroundConcepts"
              label="Background"
              onPick={(e) => {
                setVal('npcs', [
                  ...(get('npcs', []) as any[]),
                  {
                    id: makeEntityId(),
                    name: '',
                    type: '',
                    faction: '',
                    archetype: e,
                    goal: '',
                    method: '',
                  },
                ]);
              }}
            />
            <Inspire
              tableId="raceCharacterNotes"
              label="Species"
              onPick={(e) => {
                setVal('npcs', [
                  ...(get('npcs', []) as any[]),
                  {
                    id: makeEntityId(),
                    name: '',
                    type: '',
                    faction: '',
                    archetype: e,
                    goal: '',
                    method: '',
                  },
                ]);
              }}
            />
          </InspireGroup>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setVal('npcs', [
                  ...(get('npcs', []) as any[]),
                  {
                    id: makeEntityId(),
                    name: '',
                    type: '',
                    faction: '',
                    archetype: '',
                    goal: '',
                    method: '',
                  },
                ]);
                trackEvent('npc_added', 'Added a new NPC');
              }}
              className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:text-crimson"
            >
              <Plus size={12} /> Add NPC
            </button>
            {SECTION_GENERATORS.npcs.length > 0 &&
              (() => {
                const lastUsed = getLastUsed(state, 'npcs');
                if (!lastUsed) return null;
                return (
                  <SummonButton
                    section="npcs"
                    lastUsed={lastUsed}
                    options={SECTION_GENERATORS.npcs}
                    onSummon={(meta) =>
                      setSummonState({ section: 'npcs', generator: meta })
                    }
                  />
                );
              })()}
          </div>
        </Section>
      )}

      {showStep('s7-mon') && (
        <Section
          id="s7-mon"
          title="7 · Choose Relevant Monsters"
          methods={['shea']}
          done={done['s7-mon']}
          onToggle={toggleDone}
          open={isSectionOpen('s7-mon')}
          onToggleOpen={toggleOpen}
          icon={Swords}
        >
          <SoloNote>
            Solo level-1 ~8-12 HP. CR 1/8 one-at-a-time. Narrative outs always.
          </SoloNote>
          <ListField
            items={(get('monsters', []) as string[]).filter(
              (m) =>
                !usedPrep.linkedMonsterIds.has(m) &&
                !usedPrep.linkedMonsterNames.has(parseMonsterName(m)),
            )}
            onChange={(v) => {
              const used = (get('monsters', []) as string[]).filter(
                (m) =>
                  usedPrep.linkedMonsterIds.has(m) ||
                  usedPrep.linkedMonsterNames.has(parseMonsterName(m)),
              );
              setVal('monsters', [...used, ...v]);
            }}
            placeholder="Monster — CR — use case"
            target={tgt('monsters')}
            rowIdFor={(i) => `monsters-${i}`}
            highlightId={highlightEntityId}
            isShared={(i) => {
              const visibleMonsters = (get('monsters', []) as string[]).filter(
                (m) =>
                  !usedPrep.linkedMonsterIds.has(m) &&
                  !usedPrep.linkedMonsterNames.has(parseMonsterName(m)),
              );
              const m = visibleMonsters[i];
              if (!m) return false;
              const name =
                typeof m === 'string'
                  ? m.split(' — ')[0]
                  : (m as any).name || '';
              const playerLog = (get('playerLog', []) as any[]) || [];
              return playerLog.some(
                (entry) =>
                  entry.text && entry.text.includes(`Encountered: ${name}`),
              );
            }}
            onToggleShare={(i) => {
              const visibleMonsters = (get('monsters', []) as string[]).filter(
                (m) =>
                  !usedPrep.linkedMonsterIds.has(m) &&
                  !usedPrep.linkedMonsterNames.has(parseMonsterName(m)),
              );
              const m = visibleMonsters[i];
              if (!m) return;
              const name =
                typeof m === 'string'
                  ? m.split(' — ')[0]
                  : (m as any).name || '';
              const playerLog = (get('playerLog', []) as any[]) || [];
              const isCurrentlyShared = playerLog.some(
                (entry) =>
                  entry.text && entry.text.includes(`Encountered: ${name}`),
              );

              if (isCurrentlyShared) {
                const nextLog = playerLog.filter(
                  (entry) =>
                    !(entry.text && entry.text.includes(`Encountered: ${name}`)),
                );
                setVal('playerLog', nextLog);
              } else {
                const nextLog = [
                  ...playerLog,
                  {
                    id: makeLogId(),
                    text: `Encountered: ${name}`,
                    mentions: [],
                    visibility: { mode: 'party' },
                    authorRef: 'gm',
                    postedAtMs: Date.now(),
                  },
                ];
                setVal('playerLog', nextLog);
              }
            }}
          />
          {SECTION_GENERATORS.monsters.length > 0 &&
            (() => {
              const lastUsed = getLastUsed(state, 'monsters');
              if (!lastUsed) return null;
              return (
                <div className="flex">
                  <SummonButton
                    section="monsters"
                    lastUsed={lastUsed}
                    options={SECTION_GENERATORS.monsters}
                    onSummon={(meta) =>
                      setSummonState({ section: 'monsters', generator: meta })
                    }
                  />
                </div>
              );
            })()}
          <EncounterHelper
            state={
              get('__encounterCalc', {
                pcLevel: 1,
                monsters: [],
              }) as EncounterCalcState
            }
            onChange={(s) => setVal('__encounterCalc', s)}
          />
        </Section>
      )}

      {showStep('s8-rew') && (
        <Section
          id="s8-rew"
          title="8 · Select Magic Item Rewards"
          methods={['shea', 'pr']}
          done={done['s8-rew']}
          onToggle={toggleDone}
          open={isSectionOpen('s8-rew')}
          onToggleOpen={toggleOpen}
          icon={Gift}
        >
          <BookQuote source="PR ch. 6">Your +1 needs to be actionable.</BookQuote>
          <TargetBar
            current={countFilled(
              'items',
              getFilteredPrepArray('items', get('items', [])),
              get('player', {}),
            )}
            target={tgt('items')}
            source={TARGETS.items.source}
          />
          {(() => {
            const allItems = (get('items', []) as any[]) || [];
            const assignedItems = allItems.filter((item) => {
              if (typeof item === 'object' && item) {
                const isAssigned = !!item.assignedPlayerId;
                const id = String(item.id || '').trim();
                const name = String(item.name || '').trim();
                const isLinked =
                  usedPrep.linkedLootIds.has(id) ||
                  usedPrep.linkedLootNames.has(name);
                return isAssigned || isLinked;
              }
              if (typeof item === 'string') {
                const trimmed = item.trim();
                const isLinked =
                  usedPrep.linkedLootIds.has(trimmed) ||
                  usedPrep.linkedLootNames.has(trimmed);
                return isLinked;
              }
              return false;
            });
            const visibleItems = allItems.filter((item) => {
              if (typeof item === 'object' && item) {
                const isAssigned = !!item.assignedPlayerId;
                const id = String(item.id || '').trim();
                const name = String(item.name || '').trim();
                const isLinked =
                  usedPrep.linkedLootIds.has(id) ||
                  usedPrep.linkedLootNames.has(name);
                return !isAssigned && !isLinked;
              }
              if (typeof item === 'string') {
                const trimmed = item.trim();
                const isLinked =
                  usedPrep.linkedLootIds.has(trimmed) ||
                  usedPrep.linkedLootNames.has(trimmed);
                return !isLinked;
              }
              return true;
            });
            return (
              <ListField
                items={visibleItems}
                onChange={(nextUnassigned) =>
                  setVal('items', [...assignedItems, ...nextUnassigned])
                }
                placeholder="Item · what +1 hook it delivers (supports ||GM spoiler|| & @Entity)"
                rows={2}
                target={tgt('items')}
                rowIdFor={(i) => `items-${i}`}
                highlightId={highlightEntityId}
                isShared={(i) => {
                  const it = visibleItems[i];
                  if (!it || typeof it !== 'object') return false;
                  return Boolean(it.player_visible ?? it.isPublic);
                }}
                onToggleShare={(i) => {
                  const nextVisible = [...visibleItems];
                  const raw = nextVisible[i];
                  if (!raw) return;
                  if (typeof raw === 'string') {
                    const parts = raw.split(' — ');
                    nextVisible[i] = {
                      id: makeEntityId(),
                      name: parts[0] || raw,
                      description: parts.slice(1).join(' — ') || '',
                      player_visible: true,
                      isPublic: true,
                    };
                  } else {
                    const cur = Boolean(raw.player_visible ?? raw.isPublic);
                    nextVisible[i] = {
                      ...raw,
                      id: raw.id || makeEntityId(),
                      player_visible: !cur,
                      isPublic: !cur,
                    };
                  }
                  setVal('items', [...assignedItems, ...nextVisible]);
                }}
              />
            );
          })()}
          {SECTION_GENERATORS.magicItems.length > 0 &&
            (() => {
              const lastUsed = getLastUsed(state, 'magicItems');
              if (!lastUsed) return null;
              return (
                <div className="flex">
                  <SummonButton
                    section="magicItems"
                    lastUsed={lastUsed}
                    options={SECTION_GENERATORS.magicItems}
                    onSummon={(meta) =>
                      setSummonState({ section: 'magicItems', generator: meta })
                    }
                  />
                </div>
              );
            })()}
          <div className="border-t border-rule/60 pt-3">
            <p className="mb-1.5 font-display text-xs uppercase tracking-wider text-brass-deep">
              Treasure
            </p>
            <p className="mb-1.5 font-serif text-[11px] italic text-ink-mute">
              Coins, gems, art, trinkets, and other rewards — generated entries
              land here.
            </p>
            <ListField
              items={(get('treasure', []) as string[]).filter(
                (t) =>
                  !usedPrep.linkedLootIds.has(t.trim()) &&
                  !usedPrep.linkedLootNames.has(t.trim()),
              )}
              onChange={(v) => {
                const used = (get('treasure', []) as string[]).filter(
                  (t) =>
                    usedPrep.linkedLootIds.has(t.trim()) ||
                    usedPrep.linkedLootNames.has(t.trim()),
                );
                setVal('treasure', [...used, ...v]);
              }}
              placeholder="Treasure item — coins · gem · art · trinket"
              rows={2}
              rowIdFor={(i) => `treasure-${i}`}
              highlightId={highlightEntityId}
            />
          </div>
        </Section>
      )}
    </div>
  );

  if (focusedStepId !== 'all') {
    return innerContent;
  }

  return (
    <Phase
      n="3"
      title="Per-Session Prep"
      sub="Lazy DM 8-Step Checklist"
      methods={['shea']}
      audience="solo"
      icon={Calendar}
      expanded={phaseOpen.p3}
      onToggle={() => togglePhase('p3')}
    >
      {innerContent}
    </Phase>
  );
}
