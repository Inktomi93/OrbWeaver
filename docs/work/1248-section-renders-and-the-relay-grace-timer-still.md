---
kind: work
status: open
updated: 2026-10-23
priority: P3
area: server
---

# Section renders and the relay grace timer still reach the ambient process

## What

Two leftovers after item 1246. `renderMacros` and `previewActionText` (the section and lore renders in `domain/chat/assembly/assemble.ts` and `assembly/context.ts`) pass no `random`, so `{{roll}}` and `{{random}}` inside a preset section still resolve through kit's `Math.random` fallback while every turn-stage and freeze path now requires the turn PRNG. `infra/relay/quick-tunnel.ts:105` starts an ambient `setTimeout` as the SIGKILL grace for the cloudflared child. Observability request-duration stamps (`foundation/observability/middleware.ts`, `debug/bug-report.ts`) read `performance.now` for log timing only; they are measurements, not behaviour a test controls, and stay as recorded exemptions with the reason in the header.

## Why

A preset section rendered in a test can still differ run to run, and the relay's stop grace cannot be ticked by the harness.

## Done when

`macroOptionsFor` requires `random` and every render site passes the turn PRNG; the relay launcher takes `timers.timeoutUnref` from the share graph's timers; the observability exemption is written once in the process-seams header; the sweep for `Math.random` and `setTimeout(` under `packages/server/src` names only `process-seams.ts`, the definitions, the plugin broker and worker processes, the worker thread, and the observability stamps.

## Evidence

Filled at landing: what ran and where its output is.
