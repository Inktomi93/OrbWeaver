---
kind: tooling
status: open
updated: 2026-10-31
priority: P3
area: tests
plan: test-enforcement
---

# Refuse vacuous assertions and spread corpus captures in tests

## What

Extend orb/ct-negative-only-case to report an a || b inside toBe(true), and add a rule that refuses spreading a corpus capture (corpus.reads\[...]) inside tests/\*\*, pointing at serveCorpusProcedures.

## Why

An OR inside toBe(true) passes when the first operand is false, and a spread capture serves stale data past playback custody.

## Done when

Both refuse a planted case and accept the correct form; existing sites are fixed; both report zero.

## Evidence

`orb/ct-negative-only-case` reports an `||` inside a truth assertion, and runs on every test file with `{ absence: false }` outside the CT and e2e layers. `orb/no-spread-corpus-capture` is in `tooling/src/eslint/test-derivation.ts`; `tests/support/node/corpus-read-responder.int.test.ts` stays outside it because its subject is that a spread capture is refused. Controls are in `tests/tooling/eslint-test-derivation.test.ts`. `pnpm lint:eslint` over `tests/` by directory reports zero for both.
