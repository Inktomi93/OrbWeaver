---
kind: work
status: open
updated: 2026-11-03
priority: P3
area: tooling
plan: restoration-register
---

# Investigate tooling test observation gaps

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-B038-267`: Assert validations.required for the manual bug form version, install and what-happened fields in the existing integrity case.

Inspect `tests/tooling/issue-form-guidance-integrity.test.ts`.

`AF3-B038-979`: Extend the existing gallery case to inspect the actual script tag emitted for gallery HTML and the empty non-gallery control.

Inspect `tests/tooling/vite-gallery-config.test.ts`, `packages/client/vite.config.ts`, `packages/client/src/lib/zod-jitless.ts`.

`MAIN-AF3-FLAGSET-001`: Replace the collective negated arrayContaining assertion in the existing matrix-contract test with per-flag absence or an empty intersection; name offending checkpoint and flag.

## Why

`AF3-B038-267`: The current projection retains IDs only, so removing mandatory flags leaves all assertions unchanged. Optional diagnostics must remain optional.

`AF3-B038-979`: Hook object and pre-order assertions pass when the handler returns no script.

`MAIN-AF3-FLAGSET-001`: The present predicate only rejects a tape containing all seven forbidden flags together, so one forbidden action can pass.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-B038-267`: Affected native test passes; changing only the version required flag to false fails the corrected assertion.

`AF3-B038-979`: Affected native suite passes; a return-empty handler control fails the corrected case. No new build-checking framework.

`MAIN-AF3-FLAGSET-001`: Current tapes pass and a bounded one-forbidden-flag control fails for each listed flag. Preserve checkpoint-name, parser and matrix coverage.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.

`MAIN-AF3-FLAGSET-001`: The assertion rule reports the negated subset in `tests/tooling/snap/ops/matrix-contract.test.ts`. The per-flag assertion correction remains open.
