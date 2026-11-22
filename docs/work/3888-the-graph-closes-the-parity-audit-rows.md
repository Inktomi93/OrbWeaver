---
kind: tooling
status: open
updated: 2026-11-22
priority: P2
area: tooling
plan: unwired-code
---

# The graph closes the parity audit rows

## What

`reports/code-reviewer/2026-11-22-bloodhound-parity.md` lists one missing step and changes with no ruling between reports/api-play/bloodhound/ and tooling/src/unwired/graph/: the keyof hop in the origin walk, the zod enum check, the zod call skip cited as a ruling, bare-parameter variant forwards, a hand list of SDK files, the CSS read mask. The round-3 review (`reports/code-reviewer/2026-11-22-bloodhound-port-r3.md`) adds nested batches in drizzle-rows.ts, an untestable library-read case and a cast in worlds.ts. Library declarations are told apart by /node_modules/ text instead of isSourceFileFromExternalLibrary.

## Why

D357 makes the graph the one core; a step the prototype had and the graph lacks loses findings silently.

## Done when

Each row is fixed with a planted case proven red, or kept with its reason in the module header; a re-entrant batch throws; the library test is one helper on the program answer; a planted case shows import() edges reach the graph.

## Evidence

Filled at landing: what ran and where its output is.
