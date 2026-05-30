<div align="center">

[![Gamemaster Assistant](./docs/readme-assets/banner.svg)](https://gm.averykarlin.org)

### **[→ Try the live app at gm.averykarlin.org](https://gm.averykarlin.org)**

A TTRPG campaign prep webapp that stitches three published prep methodologies into a single, synced workflow.

[![Next.js 15](https://img.shields.io/badge/Next.js-15-000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind](https://img.shields.io/badge/Tailwind-3-38bdf8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Auth_%2B_Firestore-ffca28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Yjs CRDT](https://img.shields.io/badge/Yjs-offline--first_CRDT-6b46c1)](https://yjs.dev/)
[![Railway](https://img.shields.io/badge/hosted_on-Railway-0b0d0e?logo=railway&logoColor=white)](https://railway.app/)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE)

</div>

---

![Plan, Prep, Run screens](./docs/readme-assets/screens.svg)

## Why this exists

Solo and small-table DMs end up paying for Notion templates or stitching five tools together. This app gives them one place for worldbuilding, per-session prep, at-the-table tools, and player-facing reveals — synced across devices, working offline, and grounded in three books most DMs already trust.

![Three methodologies, one workflow](./docs/readme-assets/methodology.svg)

The app maps the three methodologies onto four modes: **Plan** (world-level), **Prep** (per-session), **Organize** (campaign infra), and **Run** (at the table) — plus **Library** and **Oracle** lookups.

## What it does

**Campaign editor** with structured sections for every prep item the three books call out: world facts, setting facts, factions, conflicts, PC goals, potential scenes, secrets & clues, fantastic locations, NPCs, monsters, magic items, faction clocks.

**Book-grounded target counts.** Each section shows a progress bar against a target pulled from the source material (e.g. "shoot for 10 secrets" from Lazy DM ch. 6). Targets switch between Standard, Duet, and Solo modes via a header toggle, and each card is tagged with the chapter it came from.

**Offline-first multi-device sync** via Yjs CRDTs persisted in IndexedDB and transported through Firestore. Edit on desktop, pick up your phone, the data is already there. Conflicts merge automatically. Auto-saves 1.5 seconds after you stop typing. See [docs/offline-sync.md](./docs/offline-sync.md).

**Google sign-in** via Firebase Auth. Each user's campaigns are scoped to their own UID by Firestore security rules.

**Export/Import** as JSON for offline backups.

**Solo Mode** lowers the prep-item targets to single-player-appropriate counts and is the default for new campaigns. **Duet Mode** sits between Solo and Standard.

## At-the-table tools

Beyond worldbuilding, the **Run** tab includes table-side helpers for actually running sessions: an Inspire deck of quick-roll prompts (including NPC trait inspires shown inline on NPCs), an NPC details panel for stats, traits, and notes, an encounter helper with XP budgets and difficulty calculation, dice, spell lookup, chase rules, and Renown and Downtime trackers for between-session bookkeeping.

## Player Mode

Share a **read-only, real-time view** of a campaign with your players via a link — no player accounts. Players pick their name from a GM-defined roster and see only what you reveal: party-wide by default, with per-player and per-field overrides. Reveal entities with a Private/Party/Custom toggle, or just `@`-mention them in the session-log narration feed (mentions auto-reveal, and reveals are sticky). The GM's browser publishes redacted, per-player projections to public-read Firestore docs that players read live; the unguessable share-link token is the capability. It's a **free** feature. See [docs/player-mode.md](./docs/player-mode.md) for the schema and security model.

The redaction that makes those public-read docs safe is the system's security boundary, so it's **proven, not trusted**: a `fast-check` property suite runs the real projection over arbitrary adversarial campaign state and asserts no GM-hidden entity, field, edge, or map layer ever survives into a player's view. Players can edit a safe slice of their *own* sheet (HP, conditions, notes…) via staged write-backs; an [authored CRDT merge](./ARCHITECTURE.md#5-player-write-back-and-the-authored-merge) enforces an ownership guard (a slot may only edit the PC it owns) and a field-authority policy on top of Yjs's generic merge. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full design, tradeoffs, and a data/visibility flow diagram.

## Pro features (LLM-powered)

A few features call paid inference APIs and will be gated behind a **$3.99/month** Pro subscription at launch. Pro is currently **waitlist-only** — signed-in users can join from the account page and get emailed when it opens:

- **Character sheet parser** — drop a PDF or screenshot, get a structured character entry
- **Name generator** — themed NPC name lists
- **NPC trait inspires** — generated personality hooks
- **Vivify** — streaming, campaign-aware prose (places, NPCs, scene openings, rumors, aftermath, magic-item flavor, foreshadowing, plus a free-form option). Saved generations persist under `data.vivifyHistory` (capped at the 50 most recent).

A small allowlist in `lib/pro-status.ts` (`PRO_EMAILS`) grants pro access without a subscription. See [`CLAUDE.md`](./CLAUDE.md) for the pro-gating pattern (server-side `verifyPro` + client-side `isPro` from auth context, with `LockedInline` / `LockedPanel` waitlist CTAs).

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind · Firebase (Auth + Firestore) · Yjs + y-indexeddb for CRDT sync · Stripe (dormant, awaiting launch) · Railway hosting. Fully client-side from the browser's perspective — no API backend for campaign data, no Admin SDK, just Firestore Rules enforcing per-user isolation.

## Running it yourself

Setup, deployment, costs, file structure, and troubleshooting live in [BUILD.md](./BUILD.md).

## License

This project is licensed under the GNU Affero General Public License, Version 3 (AGPL-3.0). See the [LICENSE](./LICENSE) file for the full text.
