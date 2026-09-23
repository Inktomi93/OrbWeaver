---
kind: adr
status: active
updated: 2026-09-23
---

# Content parts are built once at the request seam

## Context

Not recorded in the ledger row.

## Decision

Multimodal threading: a message body is STORED as a raw `string` (D26); images are embedded markdown refs (`![alt](asset:<id>)` / gated external URL). Content-parts are produced exactly ONCE at the REQUEST seam's CONVERT step (`domain/chat/substrate/wire-history.ts`: tokenize via `@orb/kit/content` → resolve refs via injected `ctx.resolveImageUrl` with owner = `runAsUserId`; moved out of `engine/pipeline.ts` so the read verb's previews price the same converted rows the turn fits — the seam is still the request seam and the producer is still exactly one) — assemble/shape transforms stay string-shaped. `ChatContentPart` homes in `@orb/contracts/chat`. The vision gate is DOMAIN policy (engine drops parts + emits `warning {code:"image_dropped"}` via `CHAT_WARNING_CODES`) — infra `WARNING_CODES` stays the strict resolve/runner-emit tuple. `estimateTokens` runs on the string (image under-count accepted).

- **Macro model (full law: `Chat-Macro-Resolution.md`):** storage stays raw EXCEPT volatile (nondeterministic clock/PRNG) macros, which FREEZE at commit — resolved once against the turn's pinned clock + seeded PRNG, baked into canon (`createVolatileOnlyRegistry`, sharing `registerVolatileMacros` with the names-only registry so the freeze set can't drift). IDENTITY macros stay raw forever, resolved per-view at read. Var-mutation + conversation-context macros are excluded (stay raw/inert). Commit points: user message at SEND (freeze runs BEFORE the USER_INPUT regex; one post-transform text everywhere), greeting at the first user turn (built for the selected variant, idempotent). Identity rulings: greeting/AI-line `{{user}}`/`{{persona}}` fall back to the chat ANCHOR (pinned persona), never the per-viewer persona; a human row's `{{char}}` in a multi-character room = the CAST; assemble's active persona binds to the TRIGGERING human's persona (`triggerPersonaId`). Server assemble == client display (the S1–S4 matrix test). Deferred: re-freezing a post-first-turn swipe to an unfrozen alternate; bus re-emit of the freeze.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
