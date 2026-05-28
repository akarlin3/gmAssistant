/**
 * @file route.ts
 * @description Secure server-side REST API route mapping to POST /api/player/update.
 * 
 * This route allows unauthenticated player views to submit state updates for their owned PCs.
 * Since players do not have accounts, authorization is capability-based, requiring the high-entropy
 * unguessable `shareToken` issued to the campaign.
 * 
 * Security Pipeline:
 * 1. Sanitizes inputs and formats.
 * 2. Enforces sliding-window rate limits (60/min) per token.
 * 3. Enforces Zod field path and type constraints (fail-closed allowlist).
 * 4. Resolves the shareToken against the `playerShares` collection to retrieve the parent `campaignId`.
 * 5. Verifies the user slotId is indeed a registered member in the campaign's active roster.
 * 6. Stages the validated change by merging it under campaigns/{campaignId}/pcWritebacks/{slotId}.
 */

import { getAdminDb } from '@/lib/firebase/admin';
import { validatePlayerField } from '@/lib/player/allowlist';
import { enforcePlayerRateLimit } from '@/lib/player/rate-limit';

export async function POST(req: Request) {
  try {
    // Parse the JSON request payload
    const body = await req.json();
    const { shareToken, slotId, pcId, field, value } = body;

    // --- STEP 1: Basic Payload Validation ---
    
    // Ensure the share token is present and structurally robust (min 20 characters)
    if (!shareToken || typeof shareToken !== 'string' || shareToken.length < 20) {
      return new Response(JSON.stringify({ error: 'Invalid or missing share token' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Ensure the player roster slot ID is present
    if (!slotId || typeof slotId !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid or missing slot ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Ensure the target PC sheet ID is present
    if (!pcId || typeof pcId !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid or missing PC ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // --- STEP 2: Rate Limiting Enforcement ---
    
    // Check if this token is currently exceeding the 60 requests/minute window.
    // If rate-limited, returns an HTTP 429 response containing a Retry-After header.
    const limitRes = enforcePlayerRateLimit(shareToken);
    if (limitRes) return limitRes;

    // --- STEP 3: Strict Field & Value Allowlist Check ---
    
    // Verify the requested property path and value types strictly satisfy the allowlist schemas.
    // Any unmapped paths or out-of-range numerical statistics will be blocked here.
    if (!validatePlayerField(field, value)) {
      return new Response(JSON.stringify({ error: 'Forbidden or invalid field update' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // --- STEP 4: Token to Campaign Id Resolution ---
    
    const db = getAdminDb();
    
    // Fetch the player share token document.
    // The shareToken acts as a bearer token capability, allowing us to find the correct campaignId.
    const shareSnap = await db.collection('playerShares').doc(shareToken).get();
    if (!shareSnap.exists) {
      return new Response(JSON.stringify({ error: 'Invalid share token' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const shareData = shareSnap.data()!;
    const campaignId = shareData.campaignId;
    const roster = shareData.roster || [];

    // --- STEP 5: Player Slot Membership Check ---
    
    // Confirm that the roster slot ID claiming this write actually exists in the campaign roster.
    // Prevents forged slot IDs from masquerading inside a campaign lobby.
    const slotExists = roster.some((r: any) => r.slotId === slotId);
    if (!slotExists) {
      return new Response(JSON.stringify({ error: 'Invalid player slot' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // --- STEP 6: Stage Write-back Modification ---
    
    // Stage the update inside the campaign subcollection `campaigns/{campaignId}/pcWritebacks/{slotId}`.
    // Writing here triggers the GM client's real-time snapshot reconciler.
    const writebackRef = db
      .collection('campaigns')
      .doc(campaignId)
      .collection('pcWritebacks')
      .doc(slotId);

    // Merge the update with existing staged values to avoid wiping out concurrent updates
    // on separate fields (e.g., updating HP current immediately followed by updating exhaustion).
    await writebackRef.set(
      {
        pcId,
        slotId,
        updates: {
          [field]: value,
        },
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    // Return a successful JSON response
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    // Log internal anomalies and return standard HTTP 500
    console.error('Player update error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
