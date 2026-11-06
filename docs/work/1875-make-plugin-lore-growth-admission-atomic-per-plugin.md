---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: server
plan: test-foundation
---

# Make plugin lore growth admission atomic per plugin and book

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-TSSEC-Q0013`: Make admission and growth atomic, or serialize the complete operation across all writers for the same plugin and book.

Inspect `tests/server/domain/plugin/substrate/guest-lore-write.suite.int.test.ts`, `packages/contracts/src/plugin/host-v1.ts`, `packages/server/src/domain/plugin/substrate/bridge.ts`, `packages/server/src/entry/compose/automation-plugin.ts`.

## Why

`AF3-TSSEC-Q0013`: Overlapping authorized writes can observe the same below-limit count and both grow the collection beyond its ceiling.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-TSSEC-Q0013`: Overlapping near-limit writes preserve the cap and specific refusal. Preserve existing-key updates, owner scope, grants, attachment checks and curation behavior.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
