import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../route';
import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { verifyPro, readBearerToken } from '@/lib/verify-pro';
import { callQuickInspire } from '@/lib/generators/quick-inspire-prompt';

vi.mock('@/lib/verify-pro');
vi.mock('@/lib/generators/quick-inspire-prompt');
vi.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = vi.fn();
  (MockAnthropic as any).APIError = class extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = 'APIError';
    }
  };
  return { default: MockAnthropic, APIError: (MockAnthropic as any).APIError };
});

describe('POST /api/generators/quick-inspire', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-api-key';
  });

  const createRequest = (body: any, authHeader = 'Bearer test-token') => {
    return new NextRequest('http://localhost:3000/api/generators/quick-inspire', {
      method: 'POST',
      headers: {
        'authorization': authHeader,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  };

  it('returns 401 if no auth header', async () => {
    vi.mocked(readBearerToken).mockReturnValue('');
    const req = createRequest({}, '');
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Not signed in' });
  });

  it('returns verification error if not pro', async () => {
    vi.mocked(readBearerToken).mockReturnValue('test-token');
    vi.mocked(verifyPro).mockResolvedValue({ ok: false, status: 403, message: 'Not a pro user' });

    const req = createRequest({ tableTitle: 'Test' });
    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Not a pro user' });
  });

  it('returns 500 if missing API key', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.mocked(readBearerToken).mockReturnValue('test-token');
    vi.mocked(verifyPro).mockResolvedValue({ ok: true, email: 'test@test.com', uid: 'test-uid' });

    const req = createRequest({ tableTitle: 'Test' });
    const res = await POST(req);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Server missing ANTHROPIC_API_KEY' });
  });

  it('returns 400 for invalid json', async () => {
    vi.mocked(readBearerToken).mockReturnValue('test-token');
    vi.mocked(verifyPro).mockResolvedValue({ ok: true, email: 'test@test.com', uid: 'test-uid' });

    const req = new NextRequest('http://localhost:3000/api/generators/quick-inspire', {
      method: 'POST',
      headers: { 'authorization': 'Bearer test-token' },
      body: 'invalid-json',
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON body' });
  });

  it('returns 400 for missing tableTitle', async () => {
    vi.mocked(readBearerToken).mockReturnValue('test-token');
    vi.mocked(verifyPro).mockResolvedValue({ ok: true, email: 'test@test.com', uid: 'test-uid' });

    const req = createRequest({ notTableTitle: 'Test' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing or invalid tableTitle' });
  });

  it('successfully generates response', async () => {
    vi.mocked(readBearerToken).mockReturnValue('test-token');
    vi.mocked(verifyPro).mockResolvedValue({ ok: true, email: 'test@test.com', uid: 'test-uid' });
    const mockResult = { entry: 'test response' };
    vi.mocked(callQuickInspire).mockResolvedValue(mockResult);

    const req = createRequest({ tableTitle: 'Test Table' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: mockResult });
    expect(callQuickInspire).toHaveBeenCalledWith(expect.any(Object), 'Test Table', undefined);
  });

  it('passes campaignContext correctly', async () => {
    vi.mocked(readBearerToken).mockReturnValue('test-token');
    vi.mocked(verifyPro).mockResolvedValue({ ok: true, email: 'test@test.com', uid: 'test-uid' });
    vi.mocked(callQuickInspire).mockResolvedValue({ entry: 'test' });

    const campaignContext = { partyLevel: 5, setting: 'test' };
    const req = createRequest({ tableTitle: 'Test', campaignContext });
    await POST(req);

    expect(callQuickInspire).toHaveBeenCalledWith(expect.any(Object), 'Test', campaignContext);
  });

  it('handles Anthropic API errors', async () => {
    vi.mocked(readBearerToken).mockReturnValue('test-token');
    vi.mocked(verifyPro).mockResolvedValue({ ok: true, email: 'test@test.com', uid: 'test-uid' });

    const mockError = new (Anthropic.APIError as any)(429, 'Rate limited');
    vi.mocked(callQuickInspire).mockRejectedValue(mockError);

    const req = createRequest({ tableTitle: 'Test' });
    const res = await POST(req);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'Claude API error (429): Rate limited' });
  });

  it('handles generic errors', async () => {
    vi.mocked(readBearerToken).mockReturnValue('test-token');
    vi.mocked(verifyPro).mockResolvedValue({ ok: true, email: 'test@test.com', uid: 'test-uid' });
    vi.mocked(callQuickInspire).mockRejectedValue(new Error('Generic failure'));

    const req = createRequest({ tableTitle: 'Test' });
    const res = await POST(req);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Generic failure' });
  });
});
