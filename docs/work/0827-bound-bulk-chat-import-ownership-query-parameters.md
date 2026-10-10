---
kind: bug
status: doing
updated: 2026-10-10
priority: P2
area: import
lane: wt/db-import-ownership-bounds
---

# Bound bulk chat import ownership query parameters

## What

Deduplicate the complete referenced-character ownership set before binding the import validation query. Audit adjacent import identity and hash queries for actual parameter bounds. The deployed driver rejects the repeated-ID SQL shape above its parameter ceiling.

## Why

Named speakers are appended for every imported message. Valid histories can exceed the SQL parameter limit despite referencing few distinct characters.

## Done when

Reproduce through the real bulk import operation with repeated speakers beyond the deployed parameter ceiling. Preserve pre-write refusal for a foreign speaker anywhere in the input. Prove no partial canon on refusal and preserve imported message identity. Use parameter-safe batching only where distinct populations require it.

## Evidence

Filled at landing: what ran and where its output is.
