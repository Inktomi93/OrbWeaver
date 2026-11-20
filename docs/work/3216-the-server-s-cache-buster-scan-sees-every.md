---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# The server's cache-buster scan sees every volatile macro spelling

## What

`volatileMacroRe` in `packages/server/src/domain/chat/assembly/assemble.ts` accepts only the preserve-whitespace flag between the braces and the name, while the macro parser accepts the immediate, delayed, re-evaluate and pipe flags as well. A volatile macro written with any of those flags is missed by the scan that fills the trace's cache-busters line. Use the evaluator-aware analyser in `packages/kit/src/macro/cache-safety.ts`, or accept every flag the parser accepts.

## Why

The trace line is the only place the host learns a static section busts the cache, and it is silent for these spellings.

## Done when

A test covers each flag spelling of a volatile macro in a static section and finds it in the trace's cache-busters line.

## Evidence

Filled at landing: what ran and where its output is.
