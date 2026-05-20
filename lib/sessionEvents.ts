// Change events captured during a live Run Session. Persists under
// data.__sessionChangeEvents and feeds the Phase 3 finalizer modal.

export type ChangeEventKind =
  | 'scene_used'
  | 'secret_revealed'
  | 'goal_status'
  | 'npc_added'
  | 'npc_edited'
  | 'location_added'
  | 'faction_clock_ticked'
  | 'renown_changed'
  | 'monster_added'
  | 'magic_item_given'
  | 'downtime_added'
  | 'other';

export type ChangeEvent = {
  id: string;
  ts: number;
  kind: ChangeEventKind;
  summary: string;
  before?: unknown;
  after?: unknown;
  starred?: boolean;
  dismissed?: boolean;
};

export const CHANGE_EVENT_LABELS: Record<ChangeEventKind, string> = {
  scene_used: 'Scenes Used',
  secret_revealed: 'Secrets Revealed',
  goal_status: 'Goal Status Changes',
  npc_added: 'NPCs Added',
  npc_edited: 'NPCs Edited',
  location_added: 'Locations Added',
  faction_clock_ticked: 'Clock Ticks',
  renown_changed: 'Renown Changes',
  monster_added: 'Monsters Added',
  magic_item_given: 'Magic Items Given',
  downtime_added: 'Downtime Added',
  other: 'Notes',
};

export function makeEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function makeEvent(
  kind: ChangeEventKind,
  summary: string,
  before?: unknown,
  after?: unknown,
): ChangeEvent {
  return { id: makeEventId(), ts: Date.now(), kind, summary, before, after };
}
