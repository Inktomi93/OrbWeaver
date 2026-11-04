---
kind: work
status: open
updated: 2026-11-03
priority: P2
area: testing
plan: restoration-register
---

# Own the scripted provider before awaiting character setup

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-E2ESYNC-Q001`: Register provider disposal immediately after successful startup, before awaiting character setup. Preserve stream and Stop controls.

Inspect `tests/e2e/scripted-chat.spec.ts`, `tests/e2e/support/fixture-provider.ts`, `tests/e2e/support/trpc.ts`.

## Why

`AF3-E2ESYNC-Q001`: Character setup occurs before the cleanup scope, leaving an already-listening provider unowned if setup rejects.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-E2ESYNC-Q001`: A controlled setup failure after startup observes joined provider closure. Normal streaming and cancellation remain covered.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
