---
kind: work
status: open
updated: 2026-11-12
priority: P3
area: testing
---

# Rules that comments once said a test held have no test

## What

The claims sweep reworded comments that claimed an unnamed test and found no test behind them. The concrete promises: the chat bus map has a server emit site per event (packages/contracts/src/chat/bus.ts); every top-level key of the rpg extraction schema has a registry row (packages/contracts/src/rpg/extraction-prompt.ts); the dev server's CSP differs from production only by its hot-reload allowances (packages/server/src/entry/http/security-headers.ts); toLog and rewrap carry every field of an inference error (packages/inference/src/contract/errors.ts); the Temporal parse rejects its listed loose forms and resolves a skipped or repeated local time as documented (packages/kit/src/time/index.ts); each representative hour lies inside its own range. The lane also listed client comments under packages/client that claim a test and were not checked against the test tree. The full list with locations is in the lane report, the rv-claims file under reports/lanes.

## Why

Each comment recorded a rule someone thought worth a test, and the legacy suite that held it is outside the repository. The rule now rests on review alone.

## Done when

Each listed rule has a test through its production entry, or a type that makes the drift a compile error, or a recorded decision that review holds it. Each client comment the lane listed names its test or claims none.

## Evidence

Filled at landing: what ran and where its output is.
