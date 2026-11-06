---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: testing
plan: test-foundation
---

# Scope kernel start-tick tests to their actual platform capability

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-TSSEC-Q0007`: Make the two native start-tick proofs Linux-capability-specific while retaining portable recent and stale holder stamp controls.

Inspect `tests/tooling/snap/ops/stage-holders.int.test.ts`, `tests/tooling/snap/ops/stage-census.test.ts`, `tooling/src/floor/host/platform.ts`, `tooling/src/snap/ops/stage-probe.ts`.

## Why

`AF3-TSSEC-Q0007`: The tests require an identity witness the production adapter intentionally does not provide off Linux.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-TSSEC-Q0007`: Affected Linux proofs and supported non-Linux fallback controls pass without fabricated identity or weakened production custody. Runtime qualification remains owed.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
