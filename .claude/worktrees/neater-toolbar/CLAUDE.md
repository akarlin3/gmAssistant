# Claude Code notes

## AI features must be pro-gated

Every feature that calls an LLM (Anthropic, OpenAI, etc.) or any other paid
inference API must be gated to pro users at **both** layers:

1. **Server (required, security boundary).** New routes under `app/api/` that
   invoke a model must call `verifyPro(idToken)` before doing any work. The
   reference implementation lives in `app/api/parse-character-sheet/route.ts`
   — it pulls the Bearer token from `Authorization`, validates it against
   Firebase Identity Toolkit, and returns `403 "Pro only"` if the email is not
   in `PRO_EMAILS`. Reuse that pattern; do not call the model before the check
   passes. If `verifyPro` ends up duplicated across routes, lift it into a
   shared helper rather than copying the email set.

2. **Client (UX).** Wrap the entry point (button, menu item, file input) in
   `{isPro && (...)}` using `isPro` from `useAuth()` (`lib/firebase/auth-context.tsx`).
   Don't surface upsell/teaser copy that reveals the feature exists to non-pro
   users — see the empty-state fix in `CampaignEditor.tsx` Player Characters
   section for the convention.

The pro-email allowlist is `PRO_EMAILS` in both `lib/firebase/auth-context.tsx`
and `app/api/parse-character-sheet/route.ts`. Keep them in sync (or unify
them) when adding emails.
