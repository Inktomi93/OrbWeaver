---
kind: tooling
status: blocked
updated: 2026-09-23
priority: P2
area: docs
blocked: on 11
plan: doc-migration
---

# Catalog and attestation removal

## What

Once every legacy folder has moved: delete `docs/catalog/` (the generated catalog, the lane file, the state file, every attestation file) and the catalog, sync, ratchet, bootstrap and attest verbs of `tooling/src/doc-catalog/`, keeping the formatter and the frontmatter reader by moving them into `tooling/src/doc/` (`format` becomes a `doc` verb; `pnpm format:docs` and `pnpm check:docs` re-point). Remove the `docs:catalog` stage from `tooling/src/verify/lib/registry.ts` and its trigger row; re-derive the `dangling-refs` corpora in `tooling/src/verify/lib/dangling-ref-corpus.ts` from frontmatter kinds under the four homes instead of `docs/catalog/catalog.json`; drop the `json` resource id for the catalog; delete `tests/tooling/doc-catalog/**` and mirror the survivors under `tests/tooling/doc/`; remove the `docs/catalog` rows from `biome.json`.

## Why

The whole-file hash per document and the append-only prose evidence arrays are the churn the owner measured; the new tree never entered the catalog, so removing it is a deletion, not a migration.

## Done when

`pnpm check` is green with no `docs:catalog` stage; `rg -n 'doc-catalog|docs/catalog' package.json tooling tests .claude docs AGENTS.md` returns zero; the formatter's tests pass at their new mirror path.

## Evidence

Filled at landing: what ran and where its output is.
