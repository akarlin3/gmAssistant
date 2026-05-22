import type { CampaignContext } from './types';

export async function describeScene(
  sceneText: string,
  idToken: string,
  campaignContext?: CampaignContext,
): Promise<{ description: string }> {
  const res = await fetch('/api/generators/describe-scene', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ sceneText, campaignContext }),
  });
  const body = await res.json().catch(() => ({} as { error?: string; result?: { description: string } }));
  if (!res.ok) {
    const msg = (body as { error?: string }).error || `Scene description failed (${res.status})`;
    throw new Error(msg);
  }
  return (body as { result: { description: string } }).result;
}
