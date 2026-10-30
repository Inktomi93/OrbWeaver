---
kind: work
status: open
updated: 2026-10-30
priority: P3
area: client
---

# Split the production debug-handle reader from the dev bridge, then move the dev instruments

## What

packages/client/src/lib/agent-bridge.ts is both the dev bridge installer and a module production imports: packages/client/src/features/app-shell/lib/bug-report-capture.ts reads readAgentDebugHandle and consoleErrorRing for bug reports, and agent-bridge.ts statically imports the motion flaggers, render stats, bus and tRPC devlogs and the long-task tracer, which the lib barrel also exports for production use. So those instruments cannot move under packages/client/src/dev/ without production importing dev code. Split a small production reader (the handle read and the console error ring) from the dev installer, then move the dev-only instruments under packages/client/src/dev/ behind the existing import.meta.env.DEV door.

## Why

Dev-only code mixed into lib/ hides what ships; the agent folders already live under dev/.

## Done when

Production imports only the reader; every dev-only instrument lives under packages/client/src/dev/; dependency-cruiser keeps production out of dev/; a production build contains no dev instrument (checked against unique strings); bug reports still carry the console error ring.

## Evidence

Filled at landing: what ran and where its output is.
