---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: testing
plan: test-foundation
---

# Close scratch database ownership in native fault helper tests

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-B006-finding-001`: Adopt each scratch database into a deterministic caller lifetime before additional DDL; keep trigger disposal separate and ordered before database close.

Inspect `tests/support/node/db-faults.int.test.ts`, `tests/support/node/db.ts`, `tests/support/node/db-faults.ts`, `packages/db/src/client/index.ts`.

## Why

`AF3-B006-finding-001`: Both tests allocate a fresh native database but dispose only the trigger. Successful and setup-failure paths lack database cleanup. Runtime retention magnitude is unmeasured.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-B006-finding-001`: Affected native tests pass with meaningful cleanup verification on normal and failing setup paths; real trigger behavior and assertions remain intact.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
