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

Built and run on the planted fixtures:

- `getReferencedSymbolsForNode` and `getSignatureUsage` are methods of `LanguageService` (`project.languageService`), not of `Checker`, in `node_modules/@typescript/native/dist/api/sync/api.d.ts` (class at line 490, methods at lines 504 and 508). Engine two calls the first; `getSignatureUsage` is not needed, because the scans read each reference node.
- `pnpm test:tools tests/tooling/unwired`: 10 files, 27 tests green with engine two on 7.1. The redeclared-member case was red first (two disagreements, `BaseCfg.title` and `MidCfg.title`) and green after the link; `Stranger.title` is the control that stays a finding.
- `--cross-check` runs the TypeScript 6 language service and reaches the same uses (`tests/tooling/unwired/scan.int.test.ts`).
- Scans that still load a TypeScript 6 program per world for their checker walks (reflected reads, member flows, built literals, shape hops): the bare, fields, unions and shapes verbs. Porting those walks to 7.1 is not part of this item.
- Not resolved by either engine, so a false finding remains: a member read only through a structurally identical twin type, and a member handed whole to a function typed on a wider deps bag. A `ReturnType<...>` hop, a whole value serialized by `JSON.stringify` and a whole value spread into a row are credited.

Full `pnpm unwired fields` runs on this commit, one after the other, at box load about 40: engine two on 7.1 took 29:01 with a 7.9 GB peak; `--cross-check` on TypeScript 6 took 35:52 with an 11.5 GB peak. Both reported 2193 findings and 99 disagreements, and a sorted diff of each list is empty. Most of the wall time left is the TypeScript 6 program load for the checker walks above.
