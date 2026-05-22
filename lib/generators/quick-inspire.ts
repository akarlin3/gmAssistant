import type { CampaignContext } from './types';

export async function generateQuickInspire(
  tableTitle: string,
  idToken: string,
  campaignContext?: CampaignContext,
): Promise<{ entry: string }> {
  const res = await fetch('/api/generators/quick-inspire', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ tableTitle, campaignContext }),
  });
  const body = await res.json().catch(() => ({} as { error?: string; result?: { entry: string } }));
  if (!res.ok) {
    const msg = (body as { error?: string }).error || `Quick inspire generation failed (${res.status})`;
    throw new Error(msg);
  }
  return (body as { result: { entry: string } }).result;
}
