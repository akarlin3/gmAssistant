# Gamemaster Assistant

A TTRPG campaign prep webapp that integrates three published prep methodologies into a single workflow:

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

- **Inspire tables** — quick-roll prompts (including NPC trait inspires shown inline on NPCs)
- **NPC details panel** — pull up stats, traits, and notes for any NPC at the table
- **Encounter helper** — XP budgets and difficulty calculation
- **Renown** and **Downtime** trackers for between-session bookkeeping

## Player Mode

Share a **read-only, real-time view** of a campaign with your players via a
link — no player accounts. Players pick their name from a GM-defined roster and
see only what you reveal: party-wide by default, with per-player and per-field
overrides. Reveal entities with a Private/Party/Custom toggle, or just
`@`-mention them in the session-log narration feed (mentions auto-reveal, and
reveals are sticky). The GM's browser publishes redacted, per-player projections
to public-read Firestore docs that players read live; the unguessable share-link
token is the capability. It's a **free** feature. See
[docs/player-mode.md](./docs/player-mode.md) for the schema and security model.

## Pro features (LLM-powered)

A few features call paid inference APIs and will be gated behind a $3.99/month Pro subscription at launch. Pro is currently waitlist-only — signed-in users can join from the account page and get emailed when it opens:

- **Character sheet parser** — drop a PDF or screenshot, get a structured character entry
- **Name generator** — themed NPC name lists
- **NPC trait inspires** — generated personality hooks
- **Vivify** — streaming, campaign-aware prose (places, NPCs, scene openings, rumors, aftermath, magic-item flavor, foreshadowing, plus a free-form option). Saved generations persist under `data.vivifyHistory` (capped at the 50 most recent).

A small allowlist in `lib/pro-status.ts` (`PRO_EMAILS`) gets pro access for free without a subscription. See `CLAUDE.md` for the pro-gating pattern (server-side `verifyPro` + client-side `isPro` from auth context, with `LockedInline` / `LockedPanel` waitlist CTAs).

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind · Firebase (Auth + Firestore) · Railway hosting. Fully client-side from the browser's perspective — no API backend, no Admin SDK, just Firestore Rules enforcing per-user data isolation.

## Running it yourself

Setup, deployment, costs, file structure, and troubleshooting live in [BUILD.md](./BUILD.md).

