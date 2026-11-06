---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: tooling
plan: test-foundation
---

# Keep motion exemptions explicitly excluded from verdict counts

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-B042-37`: Give exemption analyzer rows a named non-counting disposition at the existing draft owner; assert that disposition and its display in the existing exemption case.

Inspect `tests/tooling/snap/lib/run-findings.test.ts`, `tests/tooling/snap/lib/motion-problems.test.ts`, `tooling/src/snap/lib/run-finding-analyzers.ts`, `tooling/src/snap/lib/run-finding-common.ts`.

## Why

`AF3-B042-37`: Annotation severity alone does not prevent counted:true metadata, so a passing exempt measurement is displayed as having contributed to the verdict count.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-B042-37`: The native reader/display correctly excludes exemption and recorded rows while preserving ordinary failing-row counts. Existing native suite and typecheck pass; no new checker.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
