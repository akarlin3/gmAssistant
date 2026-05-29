'use client';

// Data layer for PlayerCampaignView: owns the real-time SlotProjection
// subscription and all values derived from it (the my/party PC split, the
// computed tab list, deep-link handling, and default-tab selection). Extracted
// from PlayerCampaignView so the component is left to render. Behavior — the
// Firestore subscription lifecycle, derived memo dependencies, and effect order
// — is preserved exactly.

import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Map, BookOpen, UserCircle, Gift, Compass, Target, Network } from 'lucide-react';
import { subscribeSlotProjection } from '@/lib/playerMode/playerClient';
import type { SlotProjection } from '@/lib/playerMode/types';
import { TYPE_META } from './constants';
import type { EntityRecord, PlayerPc, PlayerTab, ProjectionEntityKey } from './types';

export type UsePlayerCampaignResult = {
  projection: SlotProjection | null | undefined;
  myPcs: PlayerPc[];
  partyPcs: PlayerPc[];
  tabs: PlayerTab[];
  active: string;
  setActive: (id: string) => void;
  alertMessage: string | null;
  setAlertMessage: (msg: string | null) => void;
  isEmpty: boolean;
};

export function usePlayerCampaign({
  token,
  slotId,
  unredactedCharacters,
}: {
  token: string;
  slotId: string;
  unredactedCharacters?: EntityRecord[];
}): UsePlayerCampaignResult {
  const [projection, setProjection] = useState<SlotProjection | null | undefined>(undefined);
  const [active, setActive] = useState<string>('');
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeSlotProjection(token, slotId, setProjection, () => setProjection(null));
    return unsub;
  }, [token, slotId]);

  const { myPcs, partyPcs } = useMemo(() => {
    const pcsList = (projection?.entities?.pcs ?? []) as PlayerPc[];
    const my: PlayerPc[] = [];
    const party: PlayerPc[] = [];
    pcsList.forEach((pc) => {
      const isOwned = pc.ownership?.ownerType === 'player' && pc.ownership?.playerSlotId === slotId;
      if (isOwned) {
        my.push(pc);
      } else {
        party.push(pc);
      }
    });
    return { myPcs: my, partyPcs: party };
  }, [projection?.entities?.pcs, slotId]);

  const tabs = useMemo<PlayerTab[]>(() => {
    if (!projection) return [];
    const out: PlayerTab[] = [];

    // Add dedicated "My Sheet(s)" tab first if the slot owns any PCs
    if (myPcs.length > 0) {
      out.push({
        id: 'my_pcs',
        label: myPcs.length === 1 ? 'My Sheet' : 'My Sheets',
        icon: <UserCircle size={15} />,
      });
    }

    for (const [type, meta] of Object.entries(TYPE_META)) {
      if (type === 'pcs') {
        // Only show Party Sheets if there are other players' PCs
        if (partyPcs.length > 0) {
          out.push({ id: 'pcs', label: 'Party Sheets', icon: meta.icon });
        }
      } else {
        const items = projection.entities[type as ProjectionEntityKey];
        if ((items && items.length > 0) || (type === 'characters' && unredactedCharacters && unredactedCharacters.length > 0)) {
          out.push({ id: type, label: meta.label, icon: meta.icon });
        }
      }
    }
    if (projection.maps && projection.maps.length > 0) out.push({ id: 'maps', label: 'Maps', icon: <Map size={15} /> });
    // Connections graph: only when the GM has shared at least one edge with this
    // slot (projection.edges is already redacted in projection.ts:projectEdges).
    if (projection.edges && projection.edges.length > 0) {
      out.push({ id: 'connections', label: 'Connections', icon: <Network size={15} /> });
    }
    out.push({ id: 'recaps', label: 'Sessions', icon: <Calendar size={15} /> });
    if (projection.handouts) out.push({ id: 'handouts', label: 'Handouts', icon: <BookOpen size={15} /> });
    if (projection.items && projection.items.length > 0) {
      out.push({ id: 'items', label: 'My Items', icon: <Gift size={15} /> });
    }
    if (projection.pcGoals && projection.pcGoals.length > 0) {
      out.push({ id: 'goals', label: 'Goals', icon: <Target size={15} /> });
    }
    if (projection.planning && (
      projection.planning.pitch ||
      projection.planning.genre ||
      (projection.planning.gWorld && projection.planning.gWorld.length > 0) ||
      (projection.planning.gFNL && projection.planning.gFNL.length > 0) ||
      (projection.planning.tone && projection.planning.tone.length > 0) ||
      (projection.planning.lines && projection.planning.lines.length > 0) ||
      (projection.planning.facts && projection.planning.facts.length > 0) ||
      (projection.planning.secrets && projection.planning.secrets.length > 0) ||
      (projection.planning.conflicts && projection.planning.conflicts.length > 0)
    )) {
      out.push({ id: 'planning', label: 'Premise', icon: <Compass size={15} /> });
    }
    return out;
  }, [projection, myPcs, partyPcs, unredactedCharacters]);

  useEffect(() => {
    if (!projection || tabs.length === 0) return;

    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash;

    let targetType: string | null = null;
    let targetId: string | null = null;

    if (params.has('npc')) {
      targetType = 'npcs';
      targetId = params.get('npc');
    } else if (params.has('location')) {
      targetType = 'locations';
      targetId = params.get('location');
    } else if (params.has('faction')) {
      targetType = 'factions';
      targetId = params.get('faction');
    } else if (hash) {
      const match = hash.match(/^#(npc|location|faction)-(.*)$/);
      if (match) {
        targetType = match[1] === 'npc' ? 'npcs' : match[1] === 'location' ? 'locations' : 'factions';
        targetId = match[2];
      }
    }

    if (targetType && targetId) {
      const list = projection.entities[targetType as ProjectionEntityKey];
      const exists = Array.isArray(list) && list.some((e) => e.id === targetId);

      if (!exists) {
        // Intercept and immediately redirect (clean URL, show alert)
        const newUrl = window.location.pathname;
        window.history.replaceState(null, '', newUrl);
        setAlertMessage(`Access Denied: The requested ${targetType.replace(/s$/, '').toUpperCase()} is hidden or private.`);
        setActive(tabs[0]?.id || '');
      } else {
        // Safe access: navigate to the tab and scroll to the entity card
        setActive(targetType);
        const elementId = `entity-${targetId}`;
        setTimeout(() => {
          document.getElementById(elementId)?.scrollIntoView({ behavior: 'smooth' });
        }, 150);
      }
    }
  }, [projection, tabs]);

  useEffect(() => {
    // Only set the default active tab on initial load when 'active' is unset.
    // If a tab temporarily disappears from the calculated 'tabs' list due to
    // Firestore synchronization latency, we preserve the active selection
    // to prevent the player from losing their place in the UI.
    if (tabs.length > 0 && !active) {
      setActive(tabs[0].id);
    }
  }, [tabs, active]);

  const isEmpty = Boolean(projection && tabs.length === 0);

  return {
    projection,
    myPcs,
    partyPcs,
    tabs,
    active,
    setActive,
    alertMessage,
    setAlertMessage,
    isEmpty,
  };
}
