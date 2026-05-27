// The relationship catalog: every RelationshipKind, its human labels (forward
// and inverse), whether it is symmetric, and which entity types are valid on
// each side. The Add-Relationship modal filters its target picker against this,
// and the lookup utility uses it to render the right label on each side.

import type { EntityType, RelationshipKind } from './types';

export type RelationshipRule = {
  kind: RelationshipKind;
  label: string;
  /** shown on the target side for asymmetric kinds */
  inverseLabel: string;
  symmetric: boolean;
  validFrom: EntityType[];
  validTo: EntityType[];
};

export const RELATIONSHIP_CATALOG: RelationshipRule[] = [
  {
    kind: 'memberOf',
    label: 'Member of',
    inverseLabel: 'Has member',
    symmetric: false,
    validFrom: ['npc', 'pc'],
    validTo: ['faction'],
  },
  {
    kind: 'leaderOf',
    label: 'Leader of',
    inverseLabel: 'Led by',
    symmetric: false,
    validFrom: ['npc'],
    validTo: ['faction'],
  },
  {
    kind: 'locatedAt',
    label: 'Located at',
    inverseLabel: 'Home to',
    symmetric: false,
    validFrom: ['npc', 'faction', 'pc', 'magicItem'],
    validTo: ['location', 'fantasticLocation'],
  },
  {
    kind: 'knows',
    label: 'Knows',
    inverseLabel: 'Known by',
    symmetric: false,
    validFrom: ['npc', 'pc'],
    validTo: ['secret', 'npc', 'pc'],
  },
  {
    kind: 'allyOf',
    label: 'Ally of',
    inverseLabel: 'Ally of',
    symmetric: true,
    validFrom: ['npc', 'faction', 'pc'],
    validTo: ['npc', 'faction', 'pc'],
  },
  {
    kind: 'enemyOf',
    label: 'Enemy of',
    inverseLabel: 'Enemy of',
    symmetric: true,
    validFrom: ['npc', 'faction', 'pc'],
    validTo: ['npc', 'faction', 'pc'],
  },
  {
    kind: 'related',
    label: 'Related to',
    inverseLabel: 'Related to',
    symmetric: true,
    validFrom: [
      'npc',
      'faction',
      'location',
      'secret',
      'pc',
      'magicItem',
      'fantasticLocation',
      'monster',
      'scene',
      'potentialScene',
      'factionClock',
    ],
    validTo: [
      'npc',
      'faction',
      'location',
      'secret',
      'pc',
      'magicItem',
      'fantasticLocation',
      'monster',
      'scene',
      'potentialScene',
      'factionClock',
    ],
  },
  {
    kind: 'owns',
    label: 'Owns',
    inverseLabel: 'Owned by',
    symmetric: false,
    validFrom: ['npc', 'faction', 'pc'],
    validTo: ['magicItem', 'location', 'fantasticLocation'],
  },
  {
    kind: 'protects',
    label: 'Protects',
    inverseLabel: 'Protected by',
    symmetric: false,
    validFrom: ['npc', 'faction'],
    validTo: ['npc', 'location', 'magicItem', 'pc'],
  },
  {
    kind: 'wants',
    label: 'Wants',
    inverseLabel: 'Wanted by',
    symmetric: false,
    validFrom: ['npc', 'faction'],
    validTo: ['npc', 'faction', 'location', 'secret', 'magicItem', 'pc'],
  },
  {
    kind: 'fears',
    label: 'Fears',
    inverseLabel: 'Feared by',
    symmetric: false,
    validFrom: ['npc', 'faction'],
    validTo: ['npc', 'faction', 'secret'],
  },
  {
    kind: 'parentOf',
    label: 'Parent of',
    inverseLabel: 'Child of',
    symmetric: false,
    validFrom: ['npc'],
    validTo: ['npc', 'pc'],
  },
  {
    kind: 'mentorOf',
    label: 'Mentor of',
    inverseLabel: 'Student of',
    symmetric: false,
    validFrom: ['npc'],
    validTo: ['npc', 'pc'],
  },
  {
    kind: 'createdBy',
    label: 'Created by',
    inverseLabel: 'Created',
    symmetric: false,
    validFrom: ['magicItem', 'location', 'secret', 'fantasticLocation'],
    validTo: ['npc', 'faction'],
  },
  {
    kind: 'hiddenAt',
    label: 'Hidden at',
    inverseLabel: 'Hides',
    symmetric: false,
    validFrom: ['magicItem', 'secret'],
    validTo: ['location', 'fantasticLocation'],
  },
];

export function ruleFor(kind: RelationshipKind): RelationshipRule | undefined {
  return RELATIONSHIP_CATALOG.find((r) => r.kind === kind);
}

export function validTargets(fromType: EntityType, kind: RelationshipKind): EntityType[] {
  return (
    RELATIONSHIP_CATALOG.find((r) => r.kind === kind && r.validFrom.includes(fromType))?.validTo ??
    []
  );
}

export function validKinds(fromType: EntityType): RelationshipKind[] {
  return RELATIONSHIP_CATALOG.filter((r) => r.validFrom.includes(fromType)).map((r) => r.kind);
}
