/**
 * Origin validation helper for Next.js API routes.
 *
 * Usage in a route handler:
 *   import { validateOrigin } from '@/app/api/middleware';
 *   if (!validateOrigin(req)) return new Response('Forbidden', { status: 403 });
 */

/**
 * Returns `true` when the request is safe to process:
 *  - Server-to-server calls (no `Origin` header) are always allowed.
 *  - Browser requests are allowed when their `Origin` starts with the
 *    configured app URL (NEXTAUTH_URL > NEXT_PUBLIC_APP_URL > localhost).
 */
export function validateOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');

  // No Origin header → server-to-server / same-origin request; allow it.
  if (origin === null) return true;

  const allowedBase =
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost';

  return origin.startsWith(allowedBase);
}
