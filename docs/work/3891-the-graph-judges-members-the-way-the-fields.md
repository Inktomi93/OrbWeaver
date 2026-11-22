---
kind: tooling
status: open
updated: 2026-11-22
priority: P2
area: tooling
plan: unwired-code
---

# The graph judges members the way the fields scan does

## What

The graph reuses none of deliberate.ts, judged.ts, judged-fields.ts, field-sort.ts, literal-hits.ts, boundaries.ts or open-sends.ts, has no read-never-written bucket, and never judges a zod shape key with no satisfies twin.

## Why

Owner rulings judge a send by its receiver and keep validate-only outside-input keys apart; without these pieces graph rows cannot be judged or compared with pnpm unwired fields.

## Done when

Untwinned zod keys are judged (member-validated for validate-only keys), deliberate and judged rows report apart with stale ones flagged, member-read-only exists, each row carries its proposed sort and each sent row its destination; every piece reuses the old module as its one home; a row-by-row diff against pnpm unwired fields explains every moved row.

## Evidence

Filled at landing: what ran and where its output is.
