---
kind: tooling
status: open
updated: 2026-10-23
priority: P3
area: tooling
---

# The noise instrument no longer sees streaming aborts under Playwright 1.64

## What

Playwright 1.64 stopped emitting `requestfailed` for an aborted streaming body and for a request killed by navigation, so `tooling/src/floor/browser/document-discards.ts` and the snap noise verdict (`isNavigationAbort`, the `discarded` machinery) rarely fire through navigation any more. The `snap/ops/noise.int.test.ts` fixtures were changed to hold requests with no response head so the suite is green, which means the integration test no longer exercises the real SSE shape. Two stale comments ride along: `tooling/src/floor/browser/browser-emulation-guard.ts:1-2` says a clipped screenshot drops touch emulation, which 1.64 no longer does, and the pointer-parking fix in `design-audit-walk.ts` only covers an undriven run, so a `--goto` or `--open-chat` drive still starts with the pointer at the viewport origin.

## Why

An app-side abort of a chat stream is exactly the noise the instrument exists to catch; a green suite on fixtures that cannot produce it is a lying instrument.

## Done when

The noise instrument detects a streaming-body abort and a navigation-discarded request through whatever signal 1.64 does emit (CDP `Network.loadingFailed`, or the response body stream closing early), with a fixture that serves a real SSE body and aborts it; the two comments are corrected; the pointer park covers driven runs that navigate; `pnpm test:tools tests/tooling/snap/ops/noise.int.test.ts tests/tooling/ui-audit` green.

## Evidence

Filled at landing: what ran and where its output is.
