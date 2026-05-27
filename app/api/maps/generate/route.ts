import { NextRequest, NextResponse } from 'next/server';
import { readBearerToken, verifyPro } from '@/lib/verify-pro';
import { enforceRateLimit } from '@/lib/rate-limit';
import { checkAndIncrementMapGen, MAP_GEN_MONTHLY_LIMIT } from '@/lib/maps/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 120;

// Image generation can't reach Firebase Storage server-side (the Admin SDK is
// unavailable in this deployment — see CLAUDE.md), so this route returns the
// base64 image to the GM browser, which uploads it to maps/{uid}/{mapId}/* via
// the Web SDK (lib/maps/storage.ts → uploadGeneratedImage).

const STYLE_PREAMBLE: Record<string, string> = {
  'top-down': 'A top-down map view, hand-drawn ink and watercolor, parchment background, no text or labels.',
  isometric: 'An isometric perspective map, hand-drawn ink, parchment background, no text or labels.',
  dungeon: 'A top-down dungeon map, grid optional, hand-drawn ink, stone textures, no text or labels.',
  forest: 'A top-down forest region map, ink and watercolor, soft greens and browns, no text or labels.',
  urban: 'A top-down city or village map, ink line work, parchment background, no text or labels.',
};

// Gemini's image-capable model (a.k.a. "Nano Banana"). Returns the generated
// image inline as base64 in candidates[].content.parts[].inlineData.
const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
  }>;
};

export async function POST(req: NextRequest) {
  const idToken = readBearerToken(req.headers.get('authorization'));
  if (!idToken) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const verified = await verifyPro(idToken);
  if (!verified.ok) return NextResponse.json({ error: verified.message }, { status: verified.status });

  // Burst guardrail shared with every AI route.
  const limited = enforceRateLimit(verified.uid);
  if (limited) return limited;

  // Monthly cost cap specific to image generation.
  const usage = checkAndIncrementMapGen(verified.uid);
  if (!usage.ok) {
    return NextResponse.json(
      { error: `Monthly limit reached (${MAP_GEN_MONTHLY_LIMIT} maps).` },
      { status: 429 },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Server missing GEMINI_API_KEY' }, { status: 500 });
  }

  let body: { prompt?: unknown; style?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const style = typeof body.style === 'string' ? body.style : 'top-down';
  if (!prompt) return NextResponse.json({ error: 'A prompt is required' }, { status: 400 });
  if (prompt.length > 1000) {
    return NextResponse.json({ error: 'Prompt too long (max 1000 characters)' }, { status: 400 });
  }

  const fullPrompt = `${STYLE_PREAMBLE[style] ?? STYLE_PREAMBLE['top-down']} ${prompt}`;

  let r: Response;
  try {
    r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
        }),
      },
    );
  } catch (e) {
    console.error('[maps/generate] fetch failed', e);
    return NextResponse.json({ error: 'Generation failed' }, { status: 502 });
  }

  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    console.error('[maps/generate] image gen failed', r.status, detail.slice(0, 500));
    return NextResponse.json({ error: 'Generation failed' }, { status: 502 });
  }

  const json = (await r.json().catch(() => null)) as GeminiResponse | null;
  const b64 = json?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
  if (!b64) {
    return NextResponse.json({ error: 'Generation returned no image' }, { status: 502 });
  }

  return NextResponse.json({ b64, width: 1024, height: 1024, remaining: usage.remaining });
}
