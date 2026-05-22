# Claude Code notes

## AI features must be pro-gated

Every feature that calls an LLM (Anthropic, OpenAI, etc.) or any other paid
inference API must be gated to pro users at **both** layers:

1. **Server (required, security boundary).** New routes under `app/api/` that
   invoke a model must call `verifyPro(idToken)` from `lib/verify-pro.ts`
   before doing any work. `verifyPro` verifies the Firebase ID token via the
   Admin SDK, then approves the request if either (a) the email is in
   `PRO_EMAILS` (comp allowlist) or (b) the user's Firestore `users/{uid}` doc
   shows an active subscription with `currentPeriodEndMs > now`. Returns
   `403 "Pro only"` otherwise. Reference: `app/api/parse-character-sheet/route.ts`.

2. **Client (UX).** Read `isPro` from `useAuth()`
   (`lib/firebase/auth-context.tsx`). For AI features, **show a locked CTA**
   that reveals the feature exists and links to `/account` — use
   `<LockedInline label="…" />` for inline buttons and `<LockedPanel
   title="…">…</LockedPanel>` for whole tabs/sections. Don't simply hide the
   feature; surfacing it is the entire reason there is an upgrade flow.
   Reference: the "Upload Sheet" affordance and the "Names" tab in
   `CampaignEditor.tsx`.

The shared pro-evaluation rule lives in `lib/pro-status.ts` (`evaluatePro`,
`PRO_EMAILS`). Server (`verify-pro.ts`) and client (`auth-context.tsx`)
both import from there, so there is one source of truth.

## Stripe subscription

- Customers upgrade via Stripe Checkout (`/api/stripe/create-checkout-session`)
  and manage/cancel via Stripe Customer Portal (`/api/stripe/create-portal-session`).
- Subscription state is mirrored into Firestore by `/api/stripe/webhook`,
  which is the only writer of `users/{uid}` and `stripeCustomers/{customerId}`.
- The webhook uses the raw request body for signature verification — do not
  add middleware that consumes the body before it reaches the handler.
- Required env vars (server-side only): `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`.
