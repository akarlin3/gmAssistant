import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockVerifyPro = vi.fn();
const mockValidateOrigin = vi.fn();
const mockEnforceRateLimit = vi.fn();

vi.mock('@/lib/verify-pro', () => ({
  readBearerToken: (authHeader: string | null | undefined) => {
    if (!authHeader) return null;
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
  },
  verifyPro: (...args: unknown[]) => mockVerifyPro(...args),
}));

vi.mock('@/app/api/middleware', () => ({
  validateOrigin: (...args: unknown[]) => mockValidateOrigin(...args),
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: (...args: unknown[]) => mockEnforceRateLimit(...args),
}));

import { POST } from '../route';

function makeRequest(
  body: unknown,
  headers: Record<string, string> = {
    Authorization: 'Bearer test-pro-token',
    Origin: 'http://localhost:3000',
    'Content-Type': 'application/json',
  },
): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/customize', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/v1/customize (`app/api/v1/customize/route.ts`)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateOrigin.mockReturnValue(true);
    mockVerifyPro.mockResolvedValue({ ok: true, uid: 'gm_uid_1' });
    mockEnforceRateLimit.mockReturnValue(null);
  });

  it('rejects requests from invalid origins with 403', async () => {
    mockValidateOrigin.mockReturnValue(false);
    const res = await POST(makeRequest({ directive: 'Set block duration to 30m' }));
    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated requests missing Bearer token with 401', async () => {
    const res = await POST(
      makeRequest(
        { directive: 'Set block duration to 30m' },
        { Origin: 'http://localhost:3000' },
      ),
    );
    expect(res.status).toBe(401);
  });

  it('enforces verifyPro gating and returns 403 for non-Pro callers', async () => {
    mockVerifyPro.mockResolvedValue({
      ok: false,
      status: 403,
      message: 'Pro subscription required for AI features',
    });

    const res = await POST(makeRequest({ directive: 'Set block duration to 30m' }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/Pro subscription required/);
  });

  it('returns 400 when directive is empty', async () => {
    const res = await POST(makeRequest({ directive: '   ' }));
    expect(res.status).toBe(400);
  });

  it('returns a deterministic RFC 6902 preview payload with Apply/Revert actions for valid directives', async () => {
    const res = await POST(
      makeRequest({
        directive:
          'Change my default Cruise ceiling to 12 blocks and move Guitar to a sticky channel',
        role: 'gm',
        campaignOwnerUid: 'gm_uid_1',
        currentConfig: {
          workflow: {
            blockDurationMinutes: 25,
            cruiseCeilingBlocks: 8,
            surgeCeilingBlocks: 12,
            loadMode: 'Cruise',
            restVariant: 'standard_5e',
            activePillars: ['combat', 'exploration', 'social'],
            channels: [],
            autoSnapshotIntervalMinutes: 15,
          },
        },
      }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.preview.status).toBe('preview_ready');
    expect(data.preview.previewConfig.workflow.cruiseCeilingBlocks).toBe(12);
    expect(data.preview.actions).toMatchObject({
      canApply: true,
      canRevert: true,
      applyLabel: 'Apply Change',
      revertLabel: 'Revert',
    });
    expect(data.preview.jsonPatch.length).toBeGreaterThanOrEqual(2);
    expect(data.preview.keyValueDiff.length).toBeGreaterThanOrEqual(2);
  });

  it('returns ok=false and status=rejected when domain guardrails block out-of-range block durations', async () => {
    const res = await POST(
      makeRequest({
        directive: 'Set prep block duration to 120 minutes',
        role: 'gm',
      }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.preview.status).toBe('rejected');
    expect(data.preview.guardrailReport.valid).toBe(false);
    expect(data.preview.actions.canApply).toBe(false);
  });
});
