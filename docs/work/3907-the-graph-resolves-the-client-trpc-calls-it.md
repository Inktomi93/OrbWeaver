---
kind: tooling
status: open
updated: 2026-11-22
priority: P3
area: tooling
plan: unwired-code
---

# The graph resolves the client tRPC calls it still loses and settles CanonRow\.folded

## What

The prototype left about twenty client tRPC call sites whose procedure the graph does not resolve, and flagged CanonRow\.folded as a likely real finding that no item owns.

## Why

3882 says the graph is taught tRPC procedures to client calls; an unresolved call leaves a live procedure looking unused.

## Done when

Each unresolved call site resolves to its procedure or is listed with the reason it cannot, with a planted case for the fixed shape; CanonRow\.folded is confirmed by a delete trial and filed as a finding, or shown read.

## Evidence

Filled at landing: what ran and where its output is.
