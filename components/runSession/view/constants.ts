import {
  Eye, Users, Map, ScrollText, Skull, Gem, Target, NotebookPen,
} from 'lucide-react';
import type { SectionKey } from '../types';

export const SECTION_META: Record<SectionKey, { label: string; icon: any }> = {
  scenes:     { label: 'Potential Scenes',  icon: NotebookPen },
  secrets:    { label: 'Secrets & Clues',   icon: Eye },
  npcs:       { label: 'NPCs',              icon: Users },
  locations:  { label: 'Locations',         icon: Map },
  monsters:   { label: 'Relevant Monsters', icon: Skull },
  magicItems: { label: 'Magic Items',       icon: Gem },
  goals:      { label: 'PC Goals',          icon: Target },
  clocks:     { label: 'Faction Clocks',    icon: ScrollText },
};
