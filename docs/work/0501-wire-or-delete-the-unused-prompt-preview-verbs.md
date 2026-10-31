---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: chat
plan: unwired-code
---

# Wire or delete the unused prompt preview verbs

## What

ChatService.peekPrompt and previewSection have no router or product caller; `packages/server/src/transport/trpc/routers/chat.ts:267` says they stay unexposed on purpose. Only `tests/server/domain/chat/assembly/section-render-prng.int.test.ts` (lines 70 and 103) calls them.

## Why

Unwired code is a question about intent.

## Done when

Wire each verb to a router procedure or product caller, or delete it and its test use with a reason.

## Evidence

Deleted by owner ruling. The chat Context panel's Preview tab and the preset readout run on `previewAssembly`, which builds the same next-turn prompt `peekPrompt` returned and renders every section `previewSection` rendered one at a time. Neither verb had a router procedure or a product caller.

Deleted with them: the `previewSection` assembly render and its substrate bridge, `SectionPreview`, both params types, and `MacroRegistry.requirementsOf`, which only the preview engine was to read. The `requires` option stays, because the prompt-cache warning reads it.

Test uses now run on `previewAssembly`:

- `tests/server/domain/chat/assembly/section-render-prng.int.test.ts` keeps its PRNG-stability cases.
- `tests/server/domain/chat/verbs/read-gates.int.test.ts` keeps the host-only gate and the full-card evidence.
- `tests/server/domain/chat/verbs/read-preview-honesty.int.test.ts` keeps the no-write and persona cases.
