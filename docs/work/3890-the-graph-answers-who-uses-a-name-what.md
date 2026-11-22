---
kind: tooling
status: open
updated: 2026-11-22
priority: P2
area: tooling
plan: unwired-code
---

# The graph answers who uses a name, what an edit impacts and why a name is live

## What

reports/api-play/bloodhound/why.ts walked predecessors to the product roots with a fixed depth. The graph reports buckets but answers no query, though 3882 names transitive users, impact and reachability. registries.ts, inline-unions.ts, union-keys.ts and lib-landings.ts are prototype passes the graph does not run.

## Why

The queries are what the graph is for; the passes find stale ESLint exemptions, re-spelled string axes (3883) and why reads are lost.

## Done when

Verbs graph-why, graph-users, graph-impact and graph-reach take many names, end on a seen-set and run on a fresh build or a dump; buckets registry-stale and the inline-union buckets exist; --explain-lost breaks lost reads down by cause; each has a planted case.

## Evidence

Filled at landing: what ran and where its output is.
