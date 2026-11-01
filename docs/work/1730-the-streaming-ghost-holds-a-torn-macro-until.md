---
kind: bug
status: open
updated: 2026-11-01
priority: P3
area: client
---

# The streaming ghost holds a torn macro until its closing braces arrive, as holdTornSpeaker holds a torn speaker tag

## What

`holdTornMacro` in `packages/kit/src/macro/parser.ts` strips a trailing macro whose closing `}}` has not arrived. The ghost row (`packages/client/src/features/chat/components/ghost-message-row.tsx`) applies it to the raw streamed text and reasoning, before macro substitution, while streaming.

## Why

A chunk that ends at `{`, `{{` or inside a name rendered as literal `{{ch` until the next chunk resolved it. The hold uses the parser's own `readTag` verdict, so it matches what the renderer treats as a macro. An opener the parser reads as literal (`{{ `, `\{{`) is not held. A macro that never closes is released once the open tail passes `MAX_HELD_MACRO_LENGTH`; at stream end the ghost is not streaming and shows the text unchanged.

## Done when

- A reply streamed as `Well met, {{ch` then `ar}} and friend.` never shows `{{` in the ghost and ends as the resolved name (`tests/client/features/chat/components/ghost-macro.ct.tsx`).
- `holdTornMacro` holds every cut of a macro, nested and flagged forms, and releases literal openers and over-long tails (`tests/kit/macro/hold-torn-macro.test.ts`).
- A settled message renders as before.

## Evidence

Node unit: `pnpm test tests/kit/macro/hold-torn-macro.test.ts`, 5 passed. CT: `pnpm test:ct tests/client/features/chat/components/ghost-macro.ct.tsx`, 2 passed; with the hold disabled the new test fails on `Well met, {{ch`.
