---
kind: tooling
status: doing
updated: 2026-11-24
priority: P3
area: tooling
lane: wt/agent-a3bc1911293c5f3f8
plan: unwired-code
---

# The member-links spellings keep the walk's syntax nodes alive

## What

spellingsOf in tooling/src/unwired/graph/member-links.ts holds most of Node's live heap at the end of a narrowed build, mostly API nodes from the child walk.

## Why

A whole-tree build may carry the same share of its Node heap; it is worth cutting only if a profile shows it costs time.

## Done when

A profiled whole-tree run names the share, and if Node collection time is material the spellings keep only what later steps read and the run is faster.

## Evidence

Filled at landing: what ran and where its output is.
