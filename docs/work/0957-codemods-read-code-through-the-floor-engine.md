---
kind: work
status: open
updated: 2026-10-19
priority: P2
plan: test-foundation
---

# Codemods read code through the floor engine

## What

`tooling/src/codemod/lib` keeps its own readers for imports, exports, id casts and relocation. Route the read side of each codemod through the floor engine so a codemod changes exactly what a gate flags.

## Why

A codemod that reads code differently from the gate it serves leaves findings behind or rewrites the wrong sites.

## Done when

Codemod read paths call the floor engine; each codemod's dry-run plan is unchanged on a fixture corpus.

## Evidence

Exported declarations, export origins, static import closure and imported Vitest binding identity use existing floor readers. Original-source preservation controls and the changed corpus pass. Scoped lint and tooling/root configs pass; independent source and artifact review confirms the batch. Native manipulation and compiler relations retain their owners; this integration does not close the item.

The next reviewed batch shares exact-import admission and module-position grammar through the floor. It preserves default native matching, nonliteral arguments, relocation-specific forms and URL rewrite refusal. Original-source preservation and changed cases pass with scoped lint and tooling/root configs. Remaining native diagnostics, relation queries and caller-specific spelling decisions retain their semantics; full reader qualification remains required.

Current installed-SDK fixtures qualify migrated import, export-origin, deep-import and module-position output expectations. Retained native mutation, diagnostics and relation owners remain distinct. Complete codemod qualification and the public transaction deadline remain open. Evidence: `reports/review/957-current-migrated-reader-fixture-qualification.md`.

The census folds the remaining reads a floor reader answers: Drizzle write tables and operators in every native world, exact import spelling, deep-import module positions and package source paths. Red-first fixtures cover the adopted floor behavior; the existing codemod fixtures pass unchanged. Evidence: `reports/review/957-census.md` and `reports/review/957-version-table.md`.

The public transaction case runs as an integration test with a scaled completion allowance. A run on a loaded shared host still exceeded that allowance, so the deadline stays open with the acquisition latency work.
