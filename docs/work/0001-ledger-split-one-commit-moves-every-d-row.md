---
kind: work
status: open
updated: 2026-09-23
priority: P1
area: docs
plan: doc-migration
---

# Ledger split: one commit moves every D row to docs/adr and re-points the D-citation gate

## What

Run `pnpm doc migrate-ledger --range all --apply`, then in the same commit: re-point the `core-path-registry` ledger resource in `tooling/src/verify/contract/resource-document.ts` and the id reader in `tooling/src/verify/gates/d-citation-integrity.ts` at the ADR tree (an id resolves from a `docs/adr/NNNN-*.md` filename; the reserved range moves from the registry's note into the gate's own data, with its proof rows updated — the doc tool already reads it from `tooling/src/doc-catalog/lib/vocab.ts`, which item 0012 re-homes when the catalog leaves); delete docs/architecture/core/Core-Path-Registry.md; rewrite every `Core-Path-Registry.md D<n>` citation to the bare `D<n>` (61 code sites, about 180 doc sites, 4 in the instruction files); fold docs/architecture/core/Core-Laws-and-Precedents.md (a redirect index) into `docs/adr/README.md` and `docs/law/README.md` and delete it; drop the registry path and the ruling-anchor reader from `tooling/src/doc-catalog/lib/vocab.ts` and `tooling/src/doc-catalog/ops/tree.ts`; delete `registryFacts` from `tooling/src/doc/ops/tree.ts` and the registry read in `tooling/src/doc/lib/rules.ts`, which exist only for this interval.

## Why

The ledger is the mega-doc problem; one row per file keeps the ids stable so the five thousand bare code citations do not move. The owner ruled out a union resolver and any interval where both homes are valid.

## Done when

`pnpm check:structure` is green on `d-citation-integrity` with its population counts unchanged from the run before the split; `pnpm check:agents` reports only writing-rule findings inside `docs/adr/` (the three cleanup items own those); `rg -n 'Core-Path-Registry' packages tooling tests scripts docs .claude AGENTS.md` returns zero; `pnpm doc migrate-ledger --range all` refuses with "gone".

## Evidence

Filled at landing: what ran and where its output is.
