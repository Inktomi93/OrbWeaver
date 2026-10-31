---
kind: tooling
status: open
updated: 2026-10-30
priority: P3
area: tests
---

# Tests copy the summarize prompt marker instead of importing it

## What

The summarize marker `Transcript block:` is inline and unexported in packages/server/src/domain/chat/memory/generate/substrate/prompts.ts:24, and the testkit and about nine suites copy the literal to find summarize calls on the provider wire.

## Why

Spine-Testing §9 says constants come from their production home; a copied marker passes after production rewords the prompt and the suites stop counting summarize calls.

## Done when

The marker is a named constant in its production home, used by the prompt builder, and every test and testkit site imports it through a door or kit reach; no suite spells the literal.

## Evidence

- `SUMMARIZE_TRANSCRIPT_MARKER` in `packages/server/src/domain/chat/memory/generate/substrate/prompts.ts`, used by `digestUserPrompt`, exported from the chat door and re-exported by `@orb/testkit/node/composed`.
- Eight suites and the testkit files `tests/support/node/corpus-knowledge.ts` and `tests/support/node/corpus-knowledge-wire.ts` import it; no file under `tests` or `packages` spells the literal.
- Red: with the marker reworded in production, the old copy-based `backfill-estimate.int.test.ts` fails four cases and the importing suites pass.
- The consolidation lead in the same testkit file now reads the production slot default through `resolveProseText`.
- Whole-tree depcruise passes.
