'use client';

import React, { useMemo } from 'react';
import { Network, Eye, EyeOff, X, ExternalLink, Sparkles, Clock } from 'lucide-react';
import { useWiki } from './WikiContext';
import { buildEntityIndex, type WikiEntity } from '@/lib/wiki/entities';
import { relationshipsFor } from '@/lib/wiki/lookup';
import { ENTITY_COLORS, ENTITY_LABELS } from '@/lib/wiki/colors';
import { extractAllMentions } from '@/lib/wiki/mentions';
import { isEntityPlayerVisible, isItemPlayerVisible } from '@/lib/playerMode/spoilers';
import { MentionText } from './MentionText';
import RelationshipsSection from './RelationshipsSection';
import type { EntityType, Relationship } from '@/lib/wiki/types';

export type ConnectedLoreNode = {
  type: EntityType;
  id: string;
  name: string;
  body: string;
  relationLabel: string;
  source: 'relationship' | 'mention' | 'faction';
};

export type LoreNodeInspectorProps = {
  entityType: EntityType;
  entityId: string;
  campaignData?: Record<string, any> | null;
  onSelectNode: (type: EntityType, id: string) => void;
  onClose?: () => void;
  onJumpToEditor?: (type: EntityType, id: string) => void;
  playerSafe?: boolean;
  isPlayerVisible?: boolean;
  onTogglePlayerVisible?: ((type: EntityType, id: string, nextVisible: boolean) => void) | (() => void);
};

/**
 * Displays an entity and all of its connected lore nodes (explicit graph
 * relationships, @tag mentions, and shared faction/location references).
 * Clicking any connected node transitions the inspector to that node so the GM
 * or player can traverse the entire Relational Lore Graph.
 */
export function LoreNodeInspector({
  entityType,
  entityId,
  campaignData,
  onSelectNode,
  onClose,
  onJumpToEditor,
  playerSafe = false,
  isPlayerVisible,
  onTogglePlayerVisible,
}: LoreNodeInspectorProps) {
  const wiki = useWiki();

  const index = useMemo(() => {
    if (wiki) return wiki.index;
    if (campaignData) return buildEntityIndex(campaignData);
    return { entities: [] as WikiEntity[], byKey: new Map<string, WikiEntity>() };
  }, [wiki, campaignData]);

  const relationships = useMemo<Relationship[]>(() => {
    if (wiki) return wiki.relationships;
    if (Array.isArray(campaignData?.relationships)) return campaignData.relationships;
    if (Array.isArray(campaignData?.wiki?.relationships)) return campaignData.wiki.relationships;
    return [];
  }, [wiki, campaignData]);

  const resolveEntity = (type: EntityType, id: string): WikiEntity | undefined => {
    if (wiki) return wiki.resolve(type, id);
    return index.byKey.get(`${type}:${id}`);
  };

  const entity = useMemo(
    () => resolveEntity(entityType, entityId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wiki, index, entityType, entityId],
  );

  const effectiveIsVisible = useMemo<boolean | undefined>(() => {
    if (typeof isPlayerVisible === 'boolean') return isPlayerVisible;
    if (!campaignData || !entity) return undefined;
    if (entityType === 'npc') {
      const found = (campaignData.npcs || []).find(
        (n: any, i: number) => (n?.id || `npc-${i}`) === entityId,
      );
      return isEntityPlayerVisible(found, 'npcs', campaignData.player);
    }
    if (entityType === 'location') {
      const found = (campaignData.locations || []).find(
        (l: any, i: number) => (l?.id || `loc-${i}`) === entityId,
      );
      return isEntityPlayerVisible(found, 'locations', campaignData.player);
    }
    if (entityType === 'faction') {
      const found = (campaignData.factions || []).find(
        (f: any, i: number) => (f?.id || `fac-${i}`) === entityId,
      );
      return isEntityPlayerVisible(found, 'factions', campaignData.player);
    }
    if (entityType === 'factionClock') {
      const found = (campaignData.clocks || []).find(
        (c: any, i: number) => (c?.id || `clock-${i}`) === entityId,
      );
      return isEntityPlayerVisible(found, 'clocks', campaignData.player);
    }
    if (entityType === 'magicItem') {
      const found = (campaignData.items || []).find(
        (it: any, i: number) => (typeof it === 'object' ? it?.id || `item_${i}` : `item_${i}`) === entityId,
      );
      return isItemPlayerVisible(found);
    }
    return undefined;
  }, [isPlayerVisible, campaignData, entity, entityType, entityId]);

  const connectedNodes = useMemo<ConnectedLoreNode[]>(() => {
    const results: ConnectedLoreNode[] = [];
    const seen = new Set<string>([`${entityType}:${entityId}`]);

    // 1. Explicit relationships from the Wiki Graph
    const rels = relationshipsFor(entityType, entityId, relationships).filter(
      (r) => !r.rel.suggested && !r.rel.proposed,
    );
    for (const r of rels) {
      const key = `${r.otherType}:${r.otherId}`;
      if (seen.has(key)) continue;
      const other = resolveEntity(r.otherType, r.otherId);
      if (!other) continue;
      seen.add(key);
      results.push({
        type: r.otherType,
        id: r.otherId,
        name: other.name,
        body: other.body,
        relationLabel: r.label,
        source: 'relationship',
      });
    }

    // 2. @mentions inside this entity's body or other entities mentioning this entity
    if (entity) {
      const outgoingMentions = extractAllMentions(entity.body || '', index);
      for (const m of outgoingMentions) {
        const key = `${m.type}:${m.id}`;
        if (seen.has(key)) continue;
        const other = resolveEntity(m.type, m.id);
        if (!other) continue;
        seen.add(key);
        results.push({
          type: m.type,
          id: m.id,
          name: other.name,
          body: other.body,
          relationLabel: 'Mentioned (@tag)',
          source: 'mention',
        });
      }

      // Check entities whose body mentions @thisEntity or shares faction name
      const lowerName = entity.name.toLowerCase();
      for (const candidate of index.entities) {
        const key = `${candidate.type}:${candidate.id}`;
        if (seen.has(key)) continue;
        const bodyLower = (candidate.body || '').toLowerCase();
        if (
          lowerName.length >= 3 &&
          (bodyLower.includes(`@${lowerName}`) ||
            bodyLower.includes(`@"${lowerName}"`) ||
            ((entityType === 'faction' || candidate.type === 'faction') &&
              bodyLower.includes(lowerName)))
        ) {
          seen.add(key);
          results.push({
            type: candidate.type,
            id: candidate.id,
            name: candidate.name,
            body: candidate.body,
            relationLabel:
              entityType === 'faction' || candidate.type === 'faction'
                ? 'Faction Link'
                : 'References (@tag)',
            source: 'faction',
          });
        }
      }
    }

    return results;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wiki, index, relationships, entityType, entityId, entity]);

  if (!entity) return null;

  return (
    <div className="space-y-3 rounded-lg border border-brass-deep/50 bg-parchment p-3.5 shadow-card">
      <div className="flex items-start justify-between gap-2 border-b border-rule pb-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ background: ENTITY_COLORS[entity.type] }}
            />
            <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
              {ENTITY_LABELS[entity.type]} · Lore Node
            </span>
            {typeof effectiveIsVisible === 'boolean' && (
              <span
                className={`rounded-sm border px-1.5 py-px font-display text-[9px] uppercase tracking-wider ${
                  effectiveIsVisible
                    ? 'border-moss/50 bg-moss/10 text-moss'
                    : 'border-rule bg-parchment-deep text-ink-mute'
                }`}
              >
                {effectiveIsVisible ? 'player_visible: true' : 'player_visible: false'}
              </span>
            )}
          </div>
          <h4 className="mt-0.5 truncate font-display text-base text-ink">{entity.name}</h4>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1.5">
          {!playerSafe && onTogglePlayerVisible && (
            <button
              type="button"
              onClick={() => {
                if (onTogglePlayerVisible.length >= 2) {
                  (onTogglePlayerVisible as (t: EntityType, id: string, next: boolean) => void)(
                    entity.type,
                    entity.id,
                    !effectiveIsVisible,
                  );
                } else {
                  (onTogglePlayerVisible as () => void)();
                }
              }}
              className={`flex items-center gap-1 rounded border px-2 py-0.5 font-display text-[10px] uppercase tracking-wider transition-colors ${
                effectiveIsVisible
                  ? 'border-moss bg-moss text-parchment hover:bg-moss/90'
                  : 'border-rule bg-parchment-soft text-ink-mute hover:text-ink'
              }`}
              title="Toggle player_visible boolean for /player-view"
            >
              {effectiveIsVisible ? <Eye size={10} /> : <EyeOff size={10} />}
              {effectiveIsVisible ? 'Player Visible' : 'GM Secret'}
            </button>
          )}
          {!playerSafe && onJumpToEditor && (
            <button
              type="button"
              onClick={() => onJumpToEditor(entity.type, entity.id)}
              className="flex items-center gap-1 rounded border border-rule px-2 py-0.5 font-display text-[10px] uppercase tracking-wider text-brass-deep hover:bg-parchment-deep"
              title="Jump to full card editor"
            >
              <ExternalLink size={10} /> Edit Card
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close inspector"
              className="text-ink-mute hover:text-crimson"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {entity.body && (
        <div className="rounded border border-rule/70 bg-parchment-soft p-2.5 font-serif text-xs leading-relaxed text-ink-soft">
          <MentionText
            text={entity.body}
            playerSafe={playerSafe}
            campaignData={campaignData}
            onEntityClick={(t, id) => onSelectNode(t, id)}
          />
        </div>
      )}

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1 font-display text-[10px] uppercase tracking-wider text-brass-deep">
            <Network size={11} /> Connected Lore Nodes ({connectedNodes.length})
          </span>
          <span className="font-serif text-[10px] italic text-ink-mute">
            Click any node to traverse the graph
          </span>
        </div>

        {connectedNodes.length === 0 ? (
          <p className="rounded border border-dashed border-rule p-2 font-serif text-xs italic text-ink-mute">
            No connected lore nodes yet. Link entities below or use <code className="font-mono">@EntityName</code> in notes.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {connectedNodes.map((node) => (
              <button
                key={`${node.type}:${node.id}`}
                type="button"
                onClick={() => onSelectNode(node.type, node.id)}
                className="flex flex-col items-start rounded border border-rule bg-parchment-soft p-2 text-left transition-colors hover:border-brass-deep hover:bg-brass/10"
              >
                <div className="flex w-full items-center justify-between gap-1">
                  <span className="flex items-center gap-1 font-display text-[9px] uppercase tracking-wider text-brass-deep">
                    <span
                      className="inline-block size-2 rounded-full"
                      style={{ background: ENTITY_COLORS[node.type] }}
                    />
                    {ENTITY_LABELS[node.type]} · {node.relationLabel}
                  </span>
                  {node.type === 'factionClock' ? (
                    <Clock size={10} className="text-crimson" />
                  ) : (
                    <Sparkles size={10} className="text-brass-deep/60" />
                  )}
                </div>
                <span className="mt-0.5 font-display text-xs text-ink">{node.name}</span>
                {node.body && (
                  <span className="mt-0.5 line-clamp-1 font-serif text-[11px] italic text-ink-mute">
                    {node.body}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {!playerSafe && wiki && (
        <RelationshipsSection
          entityType={entity.type}
          entityId={entity.id}
          entityName={entity.name}
        />
      )}
    </div>
  );
}

export default LoreNodeInspector;
