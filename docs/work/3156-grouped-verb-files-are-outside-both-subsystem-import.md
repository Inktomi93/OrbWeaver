---
kind: tooling
status: open
updated: 2026-11-15
priority: P3
area: tooling
plan: typed-enforcers
---

# Grouped verb files are outside both subsystem import policies

## What

Policy `domain-substrate-mediates-subsystems` reads only flat verbs (`verbs/<file>.ts`), and policy `domain-no-cross-subsystem` skips verbs/ entirely. A file under `verbs/<group>/` can therefore import a named subsystem directly. packages/server/src/domain/rpg/verbs/read/get-tracker-view\.ts imports `#src/domain/rpg/chat-ops/tracker-view.ts` today. Widen the from-set to `verbs/` at any depth and fix every site the rule finds.

## Why

A verb in a group gets a pass that a flat verb does not, so the substrate mediation rule depends on folder depth.

## Done when

Both policies judge every file under verbs/, the found sites have a home that fits, and `pnpm depcruise` reports no violation.

## Evidence

Filled at landing: what ran and where its output is.
