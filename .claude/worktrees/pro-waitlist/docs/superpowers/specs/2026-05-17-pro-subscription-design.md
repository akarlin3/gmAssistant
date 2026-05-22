# Pro subscription via Stripe — $1.99/month

## Goal

Let signed-in users pay $1.99/month to unlock the pro AI features (character-sheet parser, name generator, NPC inspire tables, future LLM-backed features). Self-serve upgrade and cancel inside the app.

## Decisions (locked-in during brainstorming)

- **Processor:** Stripe. Checkout for purchase, Customer Portal for management.
- **Price:** $1.99/month, recurring. No trial. No annual tier (YAGNI).
- **Pro source:** `PRO_EMAILS` hardcoded set remains as a free-comp allowlist. Paid subscriptions are layered on top. `pro = comped || active subscription`.
- **Non-pro UX:** AI features are revealed with a lock icon and "Upgrade to Pro" CTA (reverses the prior "no upsell teasers" rule in `CLAUDE.md`).
- **Cancel/manage:** Stripe Customer Portal (Stripe-hosted). One in-app "Manage subscription" button → redirect.
- **Entry point:** Account dropdown in the app's header chrome; same place houses "Manage subscription" for pros and "Upgrade to Pro" for non-pros. Locked-feature CTAs in the editor also link here.

## Data model

New Firestore collection `users/{uid}`. Server-written only (Admin SDK from webhook + checkout-session route).

```ts
{
  uid: string;                    // == doc id
  email: string;                  // mirrored from auth at write time
  stripeCustomerId?: string;      // created on first checkout
  stripeSubscriptionId?: string;  // set when checkout completes
  subscriptionStatus?:
    | 'active'
    | 'trialing'
    | 'past_due'
    | 'canceled'
    | 'incomplete'
    | 'incomplete_expired'
    | 'unpaid';
  currentPeriodEnd?: Timestamp;   // pro stays valid until this even if canceled mid-cycle
  cancelAtPeriodEnd?: boolean;    // surfaced as "Cancels on <date>" in UI
  updatedAt: Timestamp;
}
```

**Pro evaluation rule (single source of truth, used both server- and client-side):**

```
pro = PRO_EMAILS.has(email.toLowerCase())
   || (subscriptionStatus in {'active','trialing'} && currentPeriodEnd > now)
```

A canceled-but-still-paid-through user stays pro until `currentPeriodEnd`. `past_due` is NOT pro (Stripe gives ~3 retries; we let it lapse cleanly).

**Firestore rule** (append to `firestore.rules`):

```
match /users/{uid} {
  allow read: if request.auth != null && request.auth.uid == uid;
  allow write: if false;
}
```

Server writes via Firebase Admin SDK with service-account credentials — bypasses rules.

## API routes

All under `app/api/stripe/`. All `runtime = 'nodejs'`.

### `POST /api/stripe/create-checkout-session`

- Auth: requires a Firebase ID token (Bearer header), same as `verify-pro`.
- Look up or create the user's Firestore doc; reuse `stripeCustomerId` if present, else create a Stripe customer with their email + uid in metadata.
- Create a Checkout Session: `mode: 'subscription'`, `line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }]`, `success_url`/`cancel_url` back to `/account?checkout=success|cancel`, `client_reference_id: uid`.
- Persist the (possibly new) `stripeCustomerId` to Firestore before returning.
- Return `{ url }`. Client navigates to it.

### `POST /api/stripe/create-portal-session`

- Auth: requires Firebase ID token.
- Read user doc, get `stripeCustomerId`. If missing, 400.
- Create a Portal session with `return_url: /account`.
- Return `{ url }`.

### `POST /api/stripe/webhook`

- No auth header. Verifies Stripe signature against `STRIPE_WEBHOOK_SECRET`.
- Must read raw body (Next.js App Router: `await req.text()`).
- Handles events:
  - `checkout.session.completed` — pulls `client_reference_id` (uid), fetches the subscription, writes status + period end + sub id to the user doc.
  - `customer.subscription.updated` — updates status, period end, cancel-at-period-end.
  - `customer.subscription.deleted` — sets status to `canceled`, leaves period end so we honor remaining time.
  - `invoice.payment_failed` — Stripe will mark sub `past_due`; the `subscription.updated` event covers state — log only.
- Idempotency: every handler is a Firestore set/merge keyed by uid (looked up via customer id → user doc, or via `client_reference_id` on `checkout.session.completed`).
- Lookup path: subscription/invoice events don't carry uid. Maintain a `stripeCustomers/{customerId}` doc with `{ uid }` written at checkout. Webhook reads that to find the user doc.

## Pro check refactor

`lib/verify-pro.ts` (server):
- Keep `PRO_EMAILS` as the comp allowlist.
- `verifyPro(idToken)` resolves email + uid from the ID token, then:
  1. If email in `PRO_EMAILS` → `{ ok: true }`.
  2. Else read `users/{uid}` via Admin SDK; apply the pro evaluation rule.
  3. Else `{ ok: false, status: 403, message: 'Pro only' }`.

`lib/firebase/auth-context.tsx` (client):
- `isPro` is reactive: subscribe to `users/{uid}` via `onSnapshot` when signed in. Re-derive `isPro` whenever email, allowlist, or doc changes. Expose new fields for UI: `subscriptionStatus`, `currentPeriodEnd`, `cancelAtPeriodEnd`.

## UI surfaces

### Account dropdown in header

Both `app/campaign/page.tsx` and the editor header currently show email + Sign Out. Add an Account menu (button with caret) that opens a small panel with:
- Email + Pro/Free badge.
- If non-pro: "Upgrade to Pro — $1.99/month" button → calls `/api/stripe/create-checkout-session`, redirects to `url`.
- If paid pro: "Manage subscription" button → calls `/api/stripe/create-portal-session`. Shows "Renews on <date>" or "Cancels on <date>".
- If comped pro: "Pro (comped)" badge, no manage button.
- Sign Out at the bottom.

### `/account` page

A small dedicated page (also reachable from the dropdown) that:
- Reads the current `?checkout=success|cancel` query param after returning from Stripe and shows a confirmation/cancel toast.
- Shows the same upgrade/manage UI as the dropdown, with more room for status + invoice link.
- This is where `success_url` and `cancel_url` and `return_url` all land.

### Locked-feature CTAs in `CampaignEditor.tsx`

Replace the `{isPro && (...)}` hides with `{isPro ? <Feature/> : <LockedFeature/>}` for:
- Names tab in nav (currently hidden when not pro).
- Player Characters "Add character" via file upload (currently hidden).
- NPC inspire buttons (currently hidden).

`<LockedFeature>` shows the feature name + a lock icon and an "Upgrade to Pro" link. Clicking sends the user to `/account`. Keep visual treatment subtle — these are revealed teasers, not aggressive paywalls.

Update `CLAUDE.md`: reverse the "don't surface upsell/teaser copy" rule. New rule: locked AI features show themselves with an upgrade CTA.

## Error handling

- **Checkout creation fails:** Show toast "Couldn't start checkout — try again". Don't write any partial state.
- **Webhook signature invalid:** Return 400. Stripe retries with backoff.
- **Webhook handler throws:** Return 500. Stripe retries. Handlers are idempotent (merge writes keyed by uid).
- **User closes tab during checkout:** Stripe still fires `checkout.session.completed` if payment succeeded. Webhook updates Firestore. Next time the user opens the app, `isPro` is true.
- **User without Stripe customer hits portal:** 400 with "No subscription found" — UI shows the upgrade button instead.
- **`past_due` users:** Drop to non-pro immediately. Stripe's Portal + dunning emails handle recovery; if they fix payment we get `subscription.updated` → `active`.
- **Race: checkout completes before user navigates back to `/account`.** Client is subscribed to user doc via `onSnapshot`, so the success page sees pro flip live.

## Out of scope (explicitly)

- Annual pricing tier.
- Proration / plan switching (only one plan).
- Refunds (handled manually via Stripe Dashboard).
- Invoice/receipt UI (Stripe Customer Portal has this).
- Team/family plans.
- Localization, multi-currency, tax handling beyond Stripe's automatic-tax setting.
- Coupons / discount codes (can add later via Stripe Dashboard without code changes if Checkout has `allow_promotion_codes: true`).

## Rollout requirements (user-side, before merging)

These must be done manually in dashboards; not automatable from code:

1. **Stripe account** — create if not already.
2. **Stripe Dashboard:**
   - Create product "Gamemaster Builder Pro" with recurring $1.99/month price → copy `price_xxx`.
   - Add webhook endpoint pointing at `https://<railway-domain>/api/stripe/webhook` subscribing to `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Copy `whsec_xxx`.
   - Enable Customer Portal (Settings → Billing → Customer Portal) with cancellation allowed and `return_url` flexibility.
3. **Firebase Console** — generate a service account JSON (Project Settings → Service accounts → Generate new private key).
4. **Env vars (Railway + `.env.local`):**
   - `STRIPE_SECRET_KEY` (sk_live_... or sk_test_... in dev)
   - `STRIPE_WEBHOOK_SECRET` (whsec_...)
   - `STRIPE_PRICE_ID` (price_...)
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (pk_... — only needed if we ever do client-side Stripe.js; not required for redirect-to-Checkout, but cheap to include)
   - `FIREBASE_SERVICE_ACCOUNT_JSON` (the full JSON contents on one line)
5. **Firestore rule** is pushed via the repo's `firestore.rules` — paste into Firebase Console after deploying.

## Testing

- Local: `stripe listen --forward-to localhost:3000/api/stripe/webhook` for webhook delivery. Stripe test mode card `4242 4242 4242 4242`.
- Smoke test plan: sign in as a non-pro account, upgrade, verify pro features unlock; cancel via portal, verify "cancels on" shows; manually delete the subscription in Stripe Dashboard, verify pro flips back to free.

## Files touched

**Create:**
- `lib/firebase/admin.ts`
- `lib/stripe.ts`
- `app/api/stripe/create-checkout-session/route.ts`
- `app/api/stripe/create-portal-session/route.ts`
- `app/api/stripe/webhook/route.ts`
- `app/account/page.tsx`
- `components/AccountMenu.tsx` (header dropdown)
- `components/LockedFeature.tsx`

**Modify:**
- `lib/verify-pro.ts` — pro check now also reads Firestore user doc
- `lib/firebase/auth-context.tsx` — reactive subscription to user doc, expose extra fields
- `firestore.rules` — add `users/{uid}` + `stripeCustomers/{customerId}` rules
- `app/campaign/page.tsx` — replace inline Sign Out with `<AccountMenu>`
- `components/CampaignEditor.tsx` — header gets `<AccountMenu>`; locked CTAs replace `{isPro && ...}` hides for Names tab, character-sheet upload, NPC inspires
- `package.json` — add `stripe`, `firebase-admin`
- `CLAUDE.md` — update pro-gating rule (locked CTAs allowed/expected)
- `README.md` — Stripe setup section, new env vars
