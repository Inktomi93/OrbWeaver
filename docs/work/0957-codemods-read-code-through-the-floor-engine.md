---
kind: work
status: doing
updated: 2026-10-19
priority: P2
lane: wt/agent-aef023c7c2023852d
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
