# Campaign Prep

A TTRPG campaign-prep webapp that integrates three published prep methodologies into a single workflow:

- **Lazy Dungeon Master** — Mike Shea's 8-step session checklist
- **Collaborative Campaign Design** — Session −1 worldbuilding (world facts, factions, conflicts, content lines)
- **Proactive Roleplaying** — the 5 Rules of Proactive Fun, including PC goal tracking

Built for solo DMs who want their notes synced across devices without paying for Notion templates or stitching together five different tools.

## What it does

- **Campaign editor** with structured sections for every prep item the three books call out: world facts, setting facts, factions, conflicts, PC goals, potential scenes, secrets & clues, fantastic locations, NPCs, monsters, magic items, faction clocks.
- **Book-grounded target counts** — each section shows a progress bar against a target pulled from the source material (e.g. "shoot for 10 secrets" from Lazy DM ch. 6). Targets switch between Standard and Solo modes via a header toggle.
- **Multi-device sync** via Firebase Firestore. Edit on desktop, pick up your phone, the data is already there. Auto-saves 1.5 seconds after you stop typing.
- **Google sign-in** via Firebase Auth. Each user's campaigns are scoped to their own UID by Firestore security rules.
- **Export/Import** as JSON for offline backups.
- **Solo Mode** lowers the prep-item targets to single-player-appropriate counts and is the default for new campaigns.

## Session-running tools

Beyond worldbuilding, the app includes table-side helpers for actually running sessions:

### Part 9 — Stripe ($1.99/month Pro subscription)

The pro AI features (character-sheet parser, name generator, NPC inspires) are paywalled at $1.99/month. Anyone in `PRO_EMAILS` (`lib/pro-status.ts`) stays free; everyone else upgrades via Stripe Checkout in-app.

26. **Stripe account.** Sign up at https://stripe.com if you don't already have one. Stay in **Test mode** until you're ready to take real payments.
27. **Create the product.** Stripe Dashboard → **Products** → **Add product**. Name "Campaign Prep Pro", recurring price **$1.99 USD / month**. Save. Copy the price ID (looks like `price_1ABCxyz…`) — you'll paste it as `STRIPE_PRICE_ID`.
28. **Get the API secret key.** Dashboard → **Developers** → **API keys** → copy the **Secret key** (`sk_test_…` in test mode). Paste it as `STRIPE_SECRET_KEY`.
29. **Webhook.** Dashboard → **Developers** → **Webhooks** → **Add endpoint**. URL is `https://<your-railway-domain>/api/stripe/webhook`. Subscribe to:
    - `checkout.session.completed`
    - `customer.subscription.created`
    - `customer.subscription.updated`
    - `customer.subscription.deleted`
    - `invoice.payment_failed`

    After creating, copy the **Signing secret** (`whsec_…`) → paste as `STRIPE_WEBHOOK_SECRET`.

30. **Customer Portal.** Dashboard → **Settings** → **Billing** → **Customer portal**. Enable it. Under "Functionality", allow customers to cancel subscriptions. Save.
31. **Firebase service account.** Firebase Console → **Project settings** (gear) → **Service accounts** tab → **Generate new private key**. A JSON file downloads. Copy the **entire JSON** as a one-line value for `FIREBASE_SERVICE_ACCOUNT_JSON` (Railway's Variables UI accepts multi-line values; locally, paste it on one line and escape newlines in the `private_key` field as `\n`).
32. **Add the new env vars** to Railway → **Variables** (and to `.env.local` for local dev):

    ```
    STRIPE_SECRET_KEY=sk_test_...
    STRIPE_WEBHOOK_SECRET=whsec_...
    STRIPE_PRICE_ID=price_...
    FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"...","client_email":"...",...}
    ```

33. **Republish Firestore rules.** `firestore.rules` now adds a `users/{uid}` collection (clients can read their own doc; only the server writes). Re-paste the file into Firebase Console → Firestore → Rules → Publish.
34. **Smoke test in test mode.** Sign in with a non-pro Google account. Click your email in the header → **Upgrade to Pro**. Stripe Checkout opens — use test card `4242 4242 4242 4242`, any future expiry, any 3 digits, any ZIP. After payment you'll return to `/account?checkout=success`. Within a couple seconds the webhook fires and the pro features unlock. Click **Manage subscription** → cancel. Confirm "Cancels on <date>" shows.

For local webhook testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook` prints a temporary `whsec_…` to use in `.env.local`.

When you're ready for real money, flip Stripe to **Live mode**, swap `sk_test_` → `sk_live_`, re-create the product/webhook in live mode, and update Railway's env vars.

---

## Pro features (LLM-powered)

A few features call paid inference APIs and are gated to a small allowlist of pro accounts:

- **Character sheet parser** — drop a PDF or screenshot, get a structured character entry (Sonnet by default, Opus opt-in)
- **Name generator** — themed NPC name lists

See `CLAUDE.md` for the pro-gating pattern (server-side `verifyPro` + client-side `isPro` from auth context).

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind · Firebase (Auth + Firestore) · Railway hosting. Fully client-side from the browser's perspective — no API backend, no Admin SDK, just Firestore Rules enforcing per-user data isolation.

## Running it yourself

Setup, deployment, costs, file structure, and troubleshooting live in [BUILD.md](./BUILD.md).
