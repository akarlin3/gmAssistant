import type { TourStep } from '@/components/Tour';

export const TOURS: Record<'solo' | 'duet', TourStep[]> = {
  solo: [
    {
      selector: '[data-oracle-button]',
      title: 'Wells Oracle',
      body: "Ask the dice when you genuinely don't know what happens next. Standard table sidebar entry moves here as a pink-accented floating button.",
    },
    {
      selector: '[data-subview-tab="scene"]',
      title: 'Scene Mode',
      body: "Run scenes turn-by-turn with AI-driven NPCs. Tagline and CTA adapt to your Solo role.",
    },
    {
      selector: '[data-subview-tab="livingworld"]',
      title: 'Living World',
      body: "Tick the world forward between sessions. Manage clocks, downtimes, faction simulacrum, and summaries.",
    },
  ],
  duet: [
    {
      selector: '[data-subview-tab="players"]',
      title: 'Player Mode',
      body: "Share this link with your single player. They can update their HP, conditions, and notes while you stay in control of the rest.",
    },
    {
      selector: '[data-subview-tab="pcs"]',
      title: 'Player Roster',
      body: "One protagonist character is player-owned and synced in real-time, other slots are sidekicks or DM NPCs.",
    },
  ],
};

export function hasSeenTour(uid: string, mode: 'solo' | 'duet'): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(`hasSeenTour:${uid}:${mode}`) === 'true';
}

export function markTourAsSeen(uid: string, mode: 'solo' | 'duet'): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`hasSeenTour:${uid}:${mode}`, 'true');
}
