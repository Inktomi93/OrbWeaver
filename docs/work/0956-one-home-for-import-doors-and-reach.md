---
kind: work
status: doing
updated: 2026-10-13
priority: P2
lane: codex/shared-references-955
plan: test-foundation
---

# One home for import doors and reach

## What

Import-door and reach questions live once: fold `verify/lib/test-reach.ts`, `test-reach-syntax.ts`, `test-import-door.ts`, `tooling-import-door.ts`, `instrument-affected-reach.ts` and `policy-production-reach.ts` with the `pnpm ast importers` and `reaches` readers into one floor reader.

## Why

Each door gate re-walks imports its own way.

## Done when

One reader; the door and reach gates and the ast verbs call it; findings and output diffed.

## Evidence

Filled at landing: what ran and where its output is.
