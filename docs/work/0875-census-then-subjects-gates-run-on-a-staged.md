---
kind: tooling
status: open
updated: 2026-10-11
priority: P3
area: verify
---

# Census-then-subjects gates run on a staged commit

## What

After 871, brand-in-name-position, zod-export-membership and the no-inline-union-redecl re-spell check still run whole-only: each needs a complete census (brand homes, z.infer owners, tuple homes) but judges per-file subjects, so the staged hook skips them and main's whole run catches their findings after merge. Further entire-population gates with long evaluate bodies were not individually audited for a per-file part; a staged source rename or deletion that orphans a test is also judged only by the whole run.

## Why

Each whole-only gate a lane's hook skips turns main red after merge, which happened repeatedly during the 851-865 merge train.

## Done when

The policy engine supports a mode whose census inputs stay complete while subjects narrow to the staged paths; the three named gates use it with staged-commit tests; the remaining entire-population gates are each classified per-file, census-then-subjects or whole-only with the reason recorded beside the scope decision.

## Evidence

Filled at landing: what ran and where its output is.
