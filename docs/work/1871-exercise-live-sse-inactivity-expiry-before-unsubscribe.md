---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: client
plan: test-foundation
---

# Exercise live SSE inactivity expiry before unsubscribe

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-B010-finding-377`: Keep a connected response stream open past its idle deadline while subscribed; observe timeout cleanup and the subsequent request, with a received-frame reset control.

Inspect `tests/client/data/bus/post-event-source.dom.test.ts`, `packages/client/src/data/bus/post-event-source.ts`.

Also compare malformed connected metadata and parser boundaries against the current adapter contract. Keep only outcomes owned by the maintained adapter.

## Why

`AF3-B010-finding-377`: The current timeout-sized advance follows unsubscribe, and its retry witness comes from EOF, so disabling deadlines can preserve the observed results.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-B010-finding-377`: Focused native adapter suite passes; removing deadline scheduling fails the maintained positive expiry control. Preserve unsubscribe and vendor-watchdog suppression controls.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
