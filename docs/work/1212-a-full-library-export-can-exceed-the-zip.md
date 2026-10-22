---
kind: bug
status: open
updated: 2026-10-22
priority: P2
plan: test-foundation
---

# A full library export can exceed the ZIP import cap

## What

Raise the compressed backup ZIP upload cap so full-library exports can be restored directly. Keep the disk-staged bundle limit separate from memory-buffered import limits.

## Why

A user restoring their own backup hits a refusal with no path forward.

## Done when

The larger bundle cap is served to the client and enforced by HTTP staging and extraction. A large synthetic-corpus backup restores through ZIP. Above-cap uploads cancel and remove staged bytes. Preserve decompression, per-entry, ownership and memory-buffered import limits.

## Evidence

`packages/contracts/src/uploads/index.ts` shares IMPORT_MAX_TOTAL_BYTES across bundle staging and other imports. `packages/server/src/entry/http/import.ts` stages bundles incrementally. The chosen remedy is a larger bundle cap; implementation and runtime acceptance remain open.
