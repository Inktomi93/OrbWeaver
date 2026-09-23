---
kind: work
status: open
updated: 2026-09-23
priority: P1
area: docs
plan: doc-migration
---

# Law move: docs/architecture/core becomes docs/law with its citers

## What

`git mv` every surviving file of `docs/architecture/core/` to `docs/law/`, section numbers untouched, and in the same commit rewrite the full-path citations by literal prefix: the 229 code sites (`Core-Tooling-Law.md` alone is 96 of them), the doc-side links, `AGENTS.md`, `.claude/rules/*.md`, `.claude/skills/**`, and the tooling constants `CORE_ANCHOR`, `LINK_SCAN_DIRS`, `AUDIT_SCAN_DIRS` (`tooling/src/verify/lib/dangling-ref-corpus.ts`, `tooling/src/verify/lib/dangling-ref-citations.ts`), `CORE_DOCS` in `tooling/src/verify/gates/d-citation-integrity.ts`, the `core-audits-debt` and `gate-enforcement-roster` ledger paths in `tooling/src/verify/contract/resource-document.ts`, the law root in `tooling/src/doc-catalog/ops/tree.ts`, `DOCS_MD_RE` in `tooling/src/verify/lib/selection.ts`, and `docs/catalog/lanes.json`. Each moved file must pass the law rules (frontmatter, the 48 KiB cap, no dead links) or the lane reports the red. The constitution `docs/architecture/core/AGENTS.md` folds into the root `AGENTS.md` and the rules it points at, or moves as law; the lane decides and says which.

## Why

`docs/law/` is the one home for standing law; a path move that keeps section numbers costs one prefix rewrite, while a renumbering costs a per-site edit at every citer.

## Done when

`docs/architecture/core/` is gone; `pnpm check:structure` is green on `dangling-doc-cite`, `dangling-refs`, `dangling-ref-citations` and `d-citation-integrity`; `pnpm check:agents` is green over `docs/law/`; `pnpm check:doc-catalog` is green or the catalog has already been removed.

## Evidence

Filled at landing: what ran and where its output is.
