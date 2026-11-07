---
kind: work
status: doing
updated: 2026-11-07
priority: P2
area: client
lane: wt/agent-aa4500e4b3cf3d80f
plan: test-foundation
---

# Establish Close-flush and post-unmount failure ordering

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-B012-finding-311`: Prevent pre-close debounce writes; witness editor removal and the held teardown write, then release rejection and assert its toast.

Inspect `tests/client/features/automation/components/rule-editor-unmount-failure.ct.tsx`, `tests/client/features/automation/components/platform-rule-action-groups.suite.ct.tsx`, `packages/client/src/forms/entity-form-base.ts`, `packages/client/src/forms/editor/create-autosave-entity-form.tsx`.

## Why

`AF3-B012-finding-311`: Immediate refusal plus real-time click ordering does not establish which save path ran or when its failure surfaced.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-B012-finding-311`: A disabled teardown control fails the repaired native case; current healthy teardown passes. Preserve the known possible pre-close retry/count caveat.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
