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

Done (cb-law): every file of the legacy core law folder moved to `docs/law/` with section numbers untouched, and its citers were rewritten in the same commit: full-path and relative citations, the `core/<doc>.md` shorthand, the moved files' own relative links, and the tooling constants (`CORE_ANCHOR`, `LINK_SCAN_DIRS`, `AUDIT_SCAN_DIRS`, `CITER_DOC_TREES`, `BARE_ROOTS`, the `core-audits-debt` and `gate-enforcement-roster` ledger paths). The catalog lane and its authority rows left with the folder, because the catalog does not index `docs/law/`. The constitution moved as law, as `docs/law/Constitution.md`: root `AGENTS.md` has no room under the always-on budget for the domain map, and a file named `AGENTS.md` under `docs/law/` would load as a nested instruction file. Its section citations (`AGENTS §N`) now read `Constitution.md §N`. Dated records under the history and reviews trees keep their old paths.

The moved law still breaks writing rules 1, 2 and 4 and the law size cap; those reds are the next cleanup and split items.

## Why

`docs/law/` is the one home for standing law; a path move that keeps section numbers costs one prefix rewrite, while a renumbering costs a per-site edit at every citer.

## Done when

The legacy core law folder is gone; `pnpm check:structure` is green on `dangling-doc-cite`, `dangling-refs`, `dangling-ref-citations` and `d-citation-integrity`; `pnpm check:agents` is green over `docs/law/`; `pnpm check:doc-catalog` is green or the catalog has already been removed.

## Evidence

Filled at landing: what ran and where its output is.
