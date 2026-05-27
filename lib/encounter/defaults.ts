export type CampaignPlayMode = 'solo' | 'duet' | 'standard';

export function defaultPartySize(mode: CampaignPlayMode): number {
  return mode === 'standard' ? 4 : 1;
}

export function showSidekickToggle(mode: CampaignPlayMode): boolean {
  return mode === 'duet';
}
