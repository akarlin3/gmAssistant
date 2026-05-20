# Gamemaster Assistant — TTRPG webapp (Firebase + Railway)

A Next.js webapp that integrates three TTRPG prep methodologies: Lazy Dungeon Master's 8-step checklist, Collaborative Campaign Design's Session −1 worldbuilding, and Proactive Roleplaying's 5 Rules of Proactive Fun.

Multi-device sync via Firebase Firestore. Auto-saves every 1.5s. Google sign-in via Firebase Auth.

---

## Stack

- Next.js 15 (App Router) · TypeScript · Tailwind CSS
- Firebase (Auth + Firestore)
- Railway (hosting)
- GitHub (source)
- ~$0/month for personal use

---

## Setup (30-45 minutes)

You'll touch three services: Firebase Console, Google Cloud Console (briefly, for OAuth), Railway, and GitHub. Order matters.

### Part 1 — Firebase project

1. Go to https://console.firebase.google.com and create a new project. Name it `gamemaster-builder` (or anything). Disable Google Analytics — not needed.
2. Wait ~30 seconds for provisioning.
3. In the project sidebar, click **Build** → **Authentication** → **Get started**.
4. **Sign-in method** tab → click **Google** → toggle Enable. Set a project support email (your email). Save.
5. Click **Build** → **Firestore Database** → **Create database**. Choose **Production mode**. Pick the region closest to you. Wait ~30s.
6. **Rules** tab → paste the contents of `firestore.rules` from this repo, overwriting the defaults. Click **Publish**.

### Part 2 — Get Firebase config

7. Go to **Project settings** (gear icon, top left next to "Project Overview").
8. Scroll to "Your apps" → click the **Web icon** (`</>`).
9. Register app — nickname `gamemaster-builder-web`. Skip Firebase Hosting checkbox. Click Register.
10. You'll see a `firebaseConfig` block. Copy these 6 values into `.env.local` (see step 18). Keep this tab open if needed.

### Part 3 — Authorize Railway domain (do this before deploying so it's ready)

11. Still in **Authentication** → **Settings** tab → **Authorized domains**. You'll add your Railway domain here in step 24. For now, note that `localhost` is pre-added — that's why local dev works without extra config.

### Part 4 — Local development

12. Make sure Node 18+ is installed: `node -v`.
13. Clone this project, then in the project folder:
    ```bash
    npm install
    ```
14. Create `.env.local` in the project root with the 6 values from step 10:
    ```
    NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=gamemaster-builder-xxxx.firebaseapp.com
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=gamemaster-builder-xxxx
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=gamemaster-builder-xxxx.appspot.com
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
    NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
    ```
15. Run:
    ```bash
    npm run dev
    ```
16. Open http://localhost:3000. Sign in with Google. Create a campaign. Type something. Open Firebase Console → Firestore — you should see a `campaigns` document appear with your data.

### Part 5 — Push to GitHub

17. Create a new private repo on github.com named `gamemaster-builder`.
18. In the project folder:
    ```bash
    git init
    git add .
    git commit -m "Initial commit"
    git branch -M main
    git remote add origin https://github.com/YOUR_USERNAME/gamemaster-builder.git
    git push -u origin main
    ```

### Part 6 — Deploy to Railway

19. Go to https://railway.app → **New Project** → **Deploy from GitHub repo** → select `gamemaster-builder`. Authorize Railway to access the repo if asked.
20. Railway auto-detects Next.js via Nixpacks and starts building. Wait ~2 minutes.
21. While building, click the service → **Variables** tab → click **Raw Editor** → paste all 6 `NEXT_PUBLIC_FIREBASE_*` values from `.env.local`. Save.
22. Railway will redeploy with the new variables. Wait another minute.
23. Click **Settings** → **Networking** → **Generate Domain**. You'll get a URL like `gamemaster-builder-production.up.railway.app`.

### Part 7 — Authorize the Railway domain in Firebase

24. Back in Firebase Console → **Authentication** → **Settings** → **Authorized domains** → **Add domain**. Paste your Railway domain (without `https://`, just the hostname). Save.
25. Visit your Railway URL. Sign in with Google. It should work.

You now have a live webapp at `https://gamemaster-builder-production.up.railway.app` (or whatever your Railway domain is) that syncs across all your devices.

### Optional Part 8 — Custom domain

If you want `prep.yourname.com`: in Railway → Settings → Networking → **Custom Domain**, follow the DNS instructions. Then add the custom domain to Firebase's Authorized domains list too.

### Part 9 — Stripe ($2.99/month Pro subscription — currently waitlist-only)

The pro AI features (character-sheet parser, name generator, NPC inspires) will be paywalled at $2.99/month. Anyone in `PRO_EMAILS` (`lib/pro-status.ts`) stays free.

**Pro is currently waitlist-only.** The non-pro UI shows "Join the Pro waitlist" instead of "Upgrade to Pro" — joining writes a doc to the `proWaitlist` Firestore collection via `POST /api/waitlist/join`. The Stripe steps below remain so existing subscribers can still manage their subscription and so you can flip the upgrade flow back on when you launch. Skip this section entirely if you don't have any existing subscribers.

26. **Stripe account.** Sign up at https://stripe.com if you don't already have one. Stay in **Test mode** until you're ready to take real payments.
27. **Create the product.** Stripe Dashboard → **Products** → **Add product**. Name "Gamemaster Assistant Pro", recurring price **$2.99 USD / month**. Save. Copy the price ID (looks like `price_1ABCxyz…`) — you'll paste it as `STRIPE_PRICE_ID`.
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

33. **Republish Firestore rules.** `firestore.rules` covers `users/{uid}` (subscription state) and `proWaitlist/{uid}` (waitlist signups) — clients can read their own doc in each; only the server writes. Re-paste the file into Firebase Console → Firestore → Rules → Publish.
34. **Smoke test the waitlist.** Sign in with a non-pro Google account. Click your email in the header → **Join the waitlist**. The button switches to "On the waitlist" and the same state shows on `/account`. Verify a doc landed at `proWaitlist/{your-uid}` in Firestore. (To smoke-test the Stripe checkout path, temporarily restore the upgrade button — it's intentionally hidden in waitlist mode.)

For local webhook testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook` prints a temporary `whsec_…` to use in `.env.local`.

When you're ready for real money, flip Stripe to **Live mode**, swap `sk_test_` → `sk_live_`, re-create the product/webhook in live mode, and update Railway's env vars.

---

## Using it

- Click "New Campaign" to create one.
- Type freely — auto-saves 1.5 seconds after you stop.
- The cloud icon in the top-right shows save status: green checkmark = saved, pulsing = saving, red = failed (hover for error).
- "Export" downloads a JSON backup. "Import" restores from one.
- Open the same URL on your phone, sign in with the same Google account, and your campaigns are there.

---

## Costs

- **Firebase free (Spark) tier**: 50K Firestore reads/day, 20K writes/day, 1 GiB storage. You will not hit any of these limits with personal use.
- **Railway**: Has a free trial; after that, hobby plan is ~$5/month for resource credits. A Next.js app with this little traffic uses maybe $1-2/month of those credits, so $5/month is the effective cost.
- **Total**: ~$5/month on Railway, or $0 if you switch to Vercel later.

---

## Troubleshooting

**Sign-in popup opens then closes with no result**
Firebase Auth's authorized domains list doesn't include your URL. Add it in Firebase Console → Authentication → Settings → Authorized domains.

**"Missing or insufficient permissions" error**
Firestore rules weren't published, or are wrong. Re-paste `firestore.rules` in the Firebase Console → Firestore → Rules tab and click Publish.

**Save shows "Save Failed"**
Open browser dev tools → Console. Likely causes: (a) Firestore rules issue, (b) the campaign's `userId` field doesn't match your auth UID (shouldn't happen unless data was manually edited).

**Railway build fails**
Open the Deploy logs in Railway. Most common: missing environment variables (the build needs `NEXT_PUBLIC_*` vars at build time, not just runtime). Make sure all 6 are in Variables, then trigger a redeploy.

**Auth state lost on refresh**
This is normal during first load — Firebase Auth restores the session from IndexedDB asynchronously. The login page redirects you in once auth is ready (you'll see "Loading…" for ~1s).

---

## Prep Item Targets

Each list section in the editor shows a target count, progress bar, and faded placeholder slots up to the target. Targets are book-grounded and switch between Solo and Group modes via the toggle in the header.

| Section | Standard | Solo | Source |
|---|---|---|---|
| World Facts | 10 | 5 | CCD ch. 1 |
| Required Entities | 5 | 3 | CCD ch. 1 |
| Content Lines | 3 | 3 | Safety tools |
| Setting Facts | 15 | 8 | CCD ch. 2 |
| Factions | 4 | 3 | CCD ch. 2 (3-4 min) |
| Active Conflicts | 3 | 2 | CCD ch. 2 |
| PC Goals | 3 | 3 | PR ch. 1 (3 concurrent) |
| Potential Scenes | 5 | 4 | Lazy DM ch. 4 (1-2/hr) |
| Secrets & Clues | 10 | 8 | Lazy DM ch. 6 ("shoot for 10") |
| Fantastic Locations | 4 | 3 | Lazy DM ch. 7 (1-2/hr) |
| Important NPCs | 4 | 3 | Lazy DM ch. 8 |
| Relevant Monsters | 4 | 3 | Lazy DM ch. 9 |
| Magic Item Rewards | 2 | 2 | Lazy DM ch. 10 |
| Active Faction Clocks | 4 | 3 | CCD ch. 6 |

Solo Mode is enabled by default for new campaigns. It persists per-campaign in Firestore via the `__soloMode` field within the campaign's data blob.

---

## File structure

```
gamemaster-builder/
├── app/
│   ├── campaign/
│   │   ├── [id]/page.tsx          # Campaign editor route
│   │   └── page.tsx               # Campaign list
│   ├── login/page.tsx             # Login page
│   ├── globals.css
│   ├── layout.tsx                 # Wraps app in AuthProvider
│   └── page.tsx                   # Root redirect (login vs campaign list)
├── components/
│   └── CampaignEditor.tsx         # Main editor UI
├── lib/firebase/
│   ├── client.ts                  # Firebase init (Auth + Firestore)
│   ├── auth-context.tsx           # React context for current user
│   └── campaigns.ts               # Firestore data layer
├── firestore.rules                # Security rules (paste into Firebase Console)
├── next.config.js                 # Note: output: 'standalone' for Railway
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
└── .env.example
```

---

## How it works

**Architecture:** Fully client-side from the browser's perspective. Firebase Auth state lives in IndexedDB; Firestore reads happen via the client SDK, with security enforced by Firestore Rules (each document's `userId` must match `request.auth.uid`).

**No backend code.** The Next.js server only serves static pages + JS bundles. Railway is just hosting Node and running `next start`. There's no API route, no server actions, no service account, no Firebase Admin SDK needed.

**Real-time sync.** Firestore's `onSnapshot` listeners push changes from the database to the browser in real time. If you edit on desktop and pick up your phone, the data is already there — no refresh needed.

**Auto-save.** A debounced effect fires `updateCampaign()` 1.5 seconds after you stop typing. The cloud indicator reflects state: pending → saving → synced (or error).
