---
kind: work
status: open
updated: 2026-09-23
priority: P1
area: docs
plan: doc-migration
---

# Writing-law merge: one style law in writing.md

## What

Fold what survives of `docs/architecture/core/Documentation-Law.md` and `docs/architecture/core/Core-Docs-Formatting-Law.md` into `.claude/rules/writing.md` and delete both: the comment decision procedure and the TSDoc tag verdicts become a short "Code comments" section or a path-scoped rule for `packages/**`; the markdown construct verdicts and the compact-table mechanics become one "Docs" section; the relocation checklist becomes a line pointing at the `doc` tool's verbs; the frontmatter schema becomes a pointer at `tooling/src/doc-catalog/lib/vocab.ts` (or its successor after the catalog leaves); the evidence section is deleted. `.claude/rules/docs.md` keeps only what is not style: the checks, the parked-set warning while `docs/architecture/proposed/` exists.

## Why

Two style laws drift; the owner ruled one home. `writing.md` already governs `docs/**` by its `paths:` and the checker enforces its rules there.

## Done when

The two law docs are gone, every citation of them repointed or dropped (`rg -n 'Documentation-Law|Core-Docs-Formatting-Law' packages tooling tests scripts docs .claude AGENTS.md` returns zero), `pnpm check:agents` is green, and `writing.md` stays under the always-on budget as a path-scoped rule.

## Evidence

Filled at landing: what ran and where its output is.
