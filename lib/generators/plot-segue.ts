// Plot Segues — pure-AI client helper. Posts to /api/generators/plot-segue
// and returns the typed result. The actual generation lives in
// lib/generators/plot-segue-prompt.ts (server-only).
//
// There is no deterministic fallback: every roll requires a Pro user and an
// authenticated request.

import type {
  CampaignContext,
  PlotSegueResult,
  PlotSegueTone,
  PlotSegueType,
} from './types';

export type PlotSegueInputs = {
  segueType: PlotSegueType;
  count: number;
  tone: PlotSegueTone;
  currentScene: string;
};

export async function generatePlotSegues(
  inputs: PlotSegueInputs,
  idToken: string,
  campaignContext?: CampaignContext,
): Promise<PlotSegueResult> {
  const res = await fetch('/api/generators/plot-segue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ inputs, campaignContext }),
  });
  const body = await res.json().catch(() => ({} as { error?: string; result?: PlotSegueResult }));
  if (!res.ok) {
    const msg = (body as { error?: string }).error || `Plot segue generation failed (${res.status})`;
    throw new Error(msg);
  }
  return (body as { result: PlotSegueResult }).result;
}
