---
kind: tooling
status: open
updated: 2026-10-31
priority: P2
area: tooling
plan: unwired-code
---

# The unwired scans ask TypeScript 7.1 for references in batches instead of TypeScript 6 one site at a time

## What

Engine two (tooling/src/unwired/language-service.ts, ServiceWorld and serviceReferences) loads every world into a TypeScript 6 language service, one world after another, and calls findReferences once per site, unbatched. The TypeScript 7.1 API the scans already load exposes the same query as Checker.getReferencedSymbolsForNode with a .gen() form that NativeWorld.batch pages (and getSignatureUsage for call sites). Move engine two onto it, batched, in the world engine one already loaded. Keep the two-engine check: engine one's own index against 7.1's find-references are still two independent algorithms. Keep TypeScript 6 as an opt-in --cross-check for occasional audits. Fix the gap the cross-check exposed: an interface member that redeclares a base member is not linked in engine one (the 65 field disagreements).

## Why

The fields scan takes about 28 minutes quiet and over 50 under load, most of it in engine two's per-site TypeScript 6 queries; the 7.1 batch path was measured at about 500 times faster for checker queries.

## Done when

A full pnpm unwired fields run with engine two on 7.1 reports the same findings and disagreements as the TypeScript 6 run on the same commit, or every difference is explained; wall time and peak memory are recorded before and after; --cross-check still runs TypeScript 6; the redeclared-member gap has a found case and a control.

## Evidence

Filled at landing: what ran and where its output is.
