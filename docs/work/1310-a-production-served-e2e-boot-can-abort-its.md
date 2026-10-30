---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: tests
plan: test-foundation
---

# A production-served e2e boot can abort its own module requests

## What

In one of four production-served corpus runs, a boot inside the corpus page fixture (openConfigGroup to /config) came up blank: the document returned 200, then ten module and CSS requests from the server origin (index CSS, jsx-runtime, react-dom, the app-shell chunk and others) ended with status -1 (aborted), retries included, so the module graph never loaded and data-app-ready never set. Not seen on the dev server. Trace: the cb-shelle2e final3 artifacts in the session scratchpad.

## Why

An intermittent blank boot makes any corpus case flaky and would be read as a product failure.

## Done when

The cause is named (the fixture navigating while the first document's modules load, or the server's static handler dropping concurrent requests) with a reproduction; it is fixed at that cause; a loop of corpus boots on the production-served path shows no aborted module request.

## Evidence

- Not the fixture's navigation: the fixture navigates only after `data-app-ready`, and 40 sequential and 144 concurrent (12 wide) corpus boots of the `/config` then `/home` flow on the production-served path produced no failed request and no blank boot. Not the static handler: `registerSpa` over the built client served 1,880 concurrent asset and navigation requests, with mixed `Accept-Encoding`, all 200 with bodies.
- Cause found and reproduced: the e2e stack's server ran under `node --watch` over every source root it loads, so a write to a watched source file mid-run stopped it. With a touch of `packages/server/src/entry/http/spa.ts` 45 s into a 14-round loop, every later request was `net::ERR_CONNECTION_REFUSED` (63 blank boots, 159 failed requests). A write landing between the document and its module requests gives the incident's shape: document 200, then module and CSS requests failing. The incident's own trace is gone, so that it was this write is the likeliest reading, not a proof.
- Fix: a stack with `E2E_HARNESS=on` plans its server without the watch flags (`serverSpawnPlan` takes `watch`). Red: the new plan test failed on the old plan. Green: the same touch 45 s into the same loop gave 84 boots, 0 blank, 0 failed requests.
