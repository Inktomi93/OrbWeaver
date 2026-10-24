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

Filled at landing: what ran and where its output is.
