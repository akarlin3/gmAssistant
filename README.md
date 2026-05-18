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

- **Inspire tables** — quick-roll prompts (including NPC trait inspires shown inline on NPCs)
- **NPC details panel** — pull up stats, traits, and notes for any NPC at the table
- **Encounter helper** — XP budgets and difficulty calculation
- **Renown** and **Downtime** trackers for between-session bookkeeping

## Pro features (LLM-powered)

A few features call paid inference APIs and are gated to a small allowlist of pro accounts:

- **Character sheet parser** — drop a PDF or screenshot, get a structured character entry (Sonnet by default, Opus opt-in)
- **Name generator** — themed NPC name lists

See `CLAUDE.md` for the pro-gating pattern (server-side `verifyPro` + client-side `isPro` from auth context).

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind · Firebase (Auth + Firestore) · Railway hosting. Fully client-side from the browser's perspective — no API backend, no Admin SDK, just Firestore Rules enforcing per-user data isolation.

## Running it yourself

Setup, deployment, costs, file structure, and troubleshooting live in [BUILD.md](./BUILD.md).
