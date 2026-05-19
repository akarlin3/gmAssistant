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

## Pro upgrade flow

Pro is currently **waitlist-only**, not on sale. The "Upgrade to Pro" button
has been replaced with "Join the Pro waitlist" everywhere user-facing
(`/account`, `AccountMenu`, `LockedPanel`). Public price at launch is
$2.99/month.

- Signed-in users join via `POST /api/waitlist/join`, which verifies the
  Firebase ID token and writes `proWaitlist/{uid}` (`{uid, email,
  displayName, createdAtMs, createdAt}`) using the Admin SDK.
- The client reads its own `proWaitlist/{uid}` doc via Firestore SDK to show
  the persisted "you're on the waitlist" state — exposed as `isOnWaitlist`
  on `useAuth()`.
- Firestore rule: clients may read their own `proWaitlist/{uid}` doc; only
  the server can write (Admin SDK from the API route).

### Stripe subscription (dormant)

Stripe Checkout/Portal code is intentionally kept in the repo for any
existing pro subscribers and so we can flip back when launching. The
non-pro UI no longer surfaces the checkout link.

- Existing subscribers still see "Manage subscription" via
  `/api/stripe/create-portal-session`.
- Subscription state is mirrored into Firestore by `/api/stripe/webhook`,
  which is the only writer of `users/{uid}` and `stripeCustomers/{customerId}`.
- The webhook uses the raw request body for signature verification — do not
  add middleware that consumes the body before it reaches the handler.
- Required env vars (server-side only): `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`.
