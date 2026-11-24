---
kind: tooling
status: doing
updated: 2026-11-24
priority: P3
area: tooling
lane: wt/agent-ae5b974b295e2abab
plan: unwired-code
---

# The unwired tool runs on the TypeScript 7.1 API alone

## What

Engine two, the TypeScript 6 language service, and the typescript package still run inside the unwired tool: unions.ts and shapes.ts open a TypeScript 6 language service on every run, classify.ts parses every referenced file a second time with TypeScript 6, worlds.ts loads configs through it, and the ports census (port-census.ts, port-plan.ts, doors.ts, forgotten-exports.ts) shares TypeScript 6 helpers with the ESLint rules. Once 3838 leaves zero engine disagreements, engine two and --cross-check go, and every unwired file reads through @typescript/native, except where the ports census keeps TypeScript 6 with a recorded reason.

## Why

Two engines double the run time and memory and keep a second opinion the scans no longer need; one engine is one set of answers to maintain.

## Done when

A --cross-check run of each scan on main shows zero disagreements before removal, engine two and the --cross-check flag are deleted with their tests, no file under tooling/src/unwired imports typescript except the ports census D357 names, the unwired suite passes, and the design's engine sections describe one engine.

## Evidence

Filled at landing: what ran and where its output is.
