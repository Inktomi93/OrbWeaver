---
kind: work
status: open
updated: 2026-11-03
priority: P2
area: tooling
plan: restoration-register
---

# Publish artifact siblings under a coherent run identity

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-B039-579`: Establish a shared publication identity or serialization for related aliases through the existing run-slot seam; preserve private slot retention.

Inspect `tests/tooling/floor/artifacts/artifact-out.int.test.ts`, `tooling/src/floor/artifacts/artifact-out.ts`, `tooling/src/floor/artifacts/artifacts.ts`.

## Why

`AF3-B039-579`: Independent per-alias atomic replacements can leave screenshot and trace pointing to different runs after two publishers finish.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-B039-579`: A deterministic native two-publisher interleaving preserves same-run siblings; existing publication/retention behavior remains valid.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
