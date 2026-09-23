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

The attestation half is already gone (no content hash, no verification commit, no evidence arrays, no attest or pending ratchet). Once every legacy folder has moved: delete what is left of `docs/catalog/` (the generated inventory, the lane file, the state file, the authority rows) and the catalog, sync and ratchet verbs of `tooling/src/doc-catalog/`, keeping the formatter and the frontmatter reader by moving them into `tooling/src/doc/` (`format` becomes a `doc` verb; `pnpm format:docs` and `pnpm check:docs` re-point; the reserved D window and the item vocabulary in `tooling/src/doc-catalog/lib/vocab.ts` move to the doc tool's own contract). Remove the `docs:catalog` stage from `tooling/src/verify/lib/registry.ts` and its trigger row; re-derive the `dangling-refs` corpora in `tooling/src/verify/lib/dangling-ref-corpus.ts` from frontmatter kinds under the four homes instead of the inventory's authority rows; drop the `json` resource id for the catalog; delete `tests/tooling/doc-catalog/**` and mirror the survivors under `tests/tooling/doc/`; remove the `docs/catalog` rows from `biome.json`.

## Why

The inventory exists only to classify legacy documents for the citation gates while they wait to migrate; when the last one moves, a frontmatter kind under a governed tree says the same thing and the second home leaves.

## Done when

`pnpm check` is green with no `docs:catalog` stage; `rg -n 'doc-catalog|docs/catalog' package.json tooling tests .claude docs AGENTS.md` returns zero; the formatter's tests pass at their new mirror path.

## Evidence

Filled at landing: what ran and where its output is.
