---
kind: tooling
status: open
updated: 2026-10-23
priority: P3
area: tests
---

# OpenAI-compatible test server fixture has two copies

## What

`tests/inference/roles/openrouter-reasoning-wire.int.test.ts` carries about twenty lines of `openAiServer` copied from `tests/inference/roles/side-gen.int.test.ts`.

## Why

One home per helper; a second copy drifts.

## Done when

One `openAiServer` builder lives in `tests/support/node/` and both tests import it.

## Evidence

Filled at landing: what ran and where its output is.
