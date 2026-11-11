---
kind: bug
status: doing
updated: 2026-11-11
priority: P2
area: tooling
lane: wt/agent-a3b00fac426662467
---

# Lint refusal messages name import doors and tests that exist

## What

Three messages point authors at things the tree does not have. `eslint.config.ts` tells authors to use `@orb/testkit/node/fixtures.ts`, which the testkit exports refuse. `tooling/src/biome-config/policy.config.ts` sends raw media to `@orb/ui/content`; the live door is `@orb/ui/message-media`. The same file says the plural sessions ban is pinned by a test file that is deleted, and one message carries a date. Source: `reports/codebase-review/units/root-lint-configs.md`.

## Why

An author who follows the refusal writes an import that cannot resolve.

## Done when

Each message names a specifier that resolves and a test that exists, `biome.json` is regenerated, and the vitest import recognition entries pinned by `tests/tooling/eslint-vitest-plugin-patch.test.ts` are kept or changed with that test.

## Evidence

Filled at landing: what ran and where its output is.
