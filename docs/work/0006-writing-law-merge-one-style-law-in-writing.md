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

Done (cb-law): the legacy documentation law and docs formatting law are folded in and deleted. The comment decision steps, the type-instead table, the comment budgets and the TSDoc tag verdicts are the path-scoped rule `.claude/rules/comments.md` (code trees). The markdown construct verdicts and the formatter mechanics are the "Markdown" section of `.claude/rules/writing.md`, and the ADR style is its "Decisions" section. The relocation checklist and the frontmatter pointers (`tooling/src/doc/lib/rules.ts`, `tooling/src/doc-catalog/lib/vocab.ts`) are in `.claude/rules/docs.md`. The evidence section is deleted.

## Why

Two style laws drift; the owner ruled one home. `writing.md` already governs `docs/**` by its `paths:` and the checker enforces its rules there.

## Done when

The two law docs are gone, every citation of them repointed or dropped (`rg -n 'Documentation-Law|Core-Docs-Formatting-Law' packages tooling tests scripts docs .claude AGENTS.md` returns zero), `pnpm check:agents` is green, and `writing.md` stays under the always-on budget as a path-scoped rule.

## Evidence

Filled at landing: what ran and where its output is.
