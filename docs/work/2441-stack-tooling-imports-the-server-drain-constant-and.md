---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: tooling
---

# Stack tooling imports the server drain constant and the canonical env keys

## What

`tooling/src/stack/lib/verdicts.ts` mirrors `SHUTDOWN_DRAIN_MS` and says the server does not export it; `packages/server/src/infra/network/index.ts` does. `tooling/src/stack/lib/setup-plan.ts`, `stack-plan.ts` and `fixture-plan.ts` redefine or hand-spell env keys that `@orb/contracts/identity` and the server data-layout contract already export, and `tests/tooling/stack/lib/setup-plan.test.ts` imports the local copies. The `DEBUG_ENV_KEYS` caption in `tooling/src/stack/contract/types.ts` claims completeness and omits its one deliberate exclusion. `tooling/src/floor/http/session-cookie.ts` spells the session cookie names a second time. Source: `docs/work/codebase-review/units/tooling-configs.md` and `tooling-floor.md`.

## Why

A rename at the canonical home leaves the copies and their tests green and wrong.

## Done when

The mirror constant and its source-read test are deleted in favour of the import. Each env key has one home that the stack files and their tests import. The caption states the exclusion. The cookie names have one home or a test that reads both.

## Evidence

Filled at landing: what ran and where its output is.
