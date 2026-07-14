---
kind: history
status: active
updated: 2026-07-13
---

# Tier-3 archaeology record

Frozen 2026-07-13, extracted from `core/Tier-3-Infra.md` + `core/Tier-3b-Providers.md`. Holds the probe
war stories and measured matrices whose STANDING findings live on in those two law docs — this file is the
blow-by-blow (version numbers, token counts, dead-channel autopsies) that a cold agent doesn't need to
reason about the live code, kept only so the measurements aren't lost. Reproduce anything here with the
cited hand-run probe; do not treat the numbers as current (they are pinned to the SDK/model versions named).

## The agent-sdk cache-control probe matrix

Standing finding (see `Tier-3b-Providers.md` Esoteric §5): the agent-sdk path can't place cache breakpoints
(the SDK owns the wire body), so dynamic system context routes per `dynamicContextChannel` — `message-tail`
(the `dynamicContextOptions` `UserPromptSubmit` hook) is the cache-safe channel and is now LIVE; `system-block`
(the joined `systemPrompt` string) is the cache-busting fallback. The empirical matrix below is what proved it.

Codified in the hand-run probe `scripts/probes/sdk-cache-probe.ts` (`pnpm sdk:cache-probe` — live tiny
Max-sub turns, re-run after every SDK bump; prints per-turn cacheRead/cacheWrite). **Measured on SDK 0.3.205
/ Haiku 4.5 (\~12.6k-token system prompt):**

- **(a)** a RESUMED session cache-reads the whole prior prefix (\~12.6k read, \~0 write — the prompt-cache
  survival the seed-reseed logic protects).
- **(b)** the caching is CONTENT-keyed, not session-keyed — two FRESH sessions with a byte-identical request,
  and a byte-identical deterministic RESEED after a cold restart, both cache-read the first's prefix (this is
  what makes per-speaker group reseeds and cross-restart resume affordable with no durable store).
- **(c)** the LIVE joined `systemPrompt` string busts the ENTIRE system block when the dynamic tail changes
  (\~12.7k re-write every scene change — the cost the `dynamicContextOptions` seam removes).
- **(d)** the SDK's ARRAY `systemPrompt` `[static, dynamic]` form preserves the static-half cache-read across a
  dynamic-half change (\~12.6k read) BUT the `[Scene note …]` sentinel STILL leaks into visible context (the
  model quotes it back) — the 0.3.19x leak that made `buildSystemPrompt` join the halves is NOT fixed, so the
  array form stays unusable for volatile context.
- **(e)** the WORKING volatile-context channel is `dynamicContextOptions` (a programmatic `UserPromptSubmit`
  hook whose `additionalContext` the runtime injects at the message tail): the model reads it AND the history
  cache stays warm (\~12.7k read + \~60 write on a resumed turn) — cache-safe by construction since it never
  touches the prefix.
- **(f)** DEAD channel: seeding a raw `{type:"api_system"}` frame into the resumed transcript does NOT inject a
  mid-conversation `role:"system"` message (the unchained frame breaks resume; the operator instruction is
  ignored) — the runtime constructs `api_system` itself from a live channel under the
  `mid-conversation-system-2026-04-07` beta, not from a caller-seeded frame.

At extraction time (e) had graduated from "built, tested, not yet on the live turn" to the LIVE `message-tail`
channel in `agent-sdk/runner.ts`'s `routeDynamicContext` — this record is the pre-graduation measurement set
that justified the wiring.
