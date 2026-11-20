---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: connection
plan: import-robustness
---

# A deep JSON value saved on a connection can overflow the stack in the embedding fingerprints

## What

`stableStringify` in `packages/kit/src/stable-stringify/index.ts` is recursive. Four callers walk a connection's `features`, `extras` and `transport`: `connectionFingerprint`, `vectorSpaceFingerprint` and `generationIdOf` in `packages/server/src/primitives/embedding-generation/index.ts`, and the patch compare in `packages/server/src/domain/connection/verbs/preview-embed-space-change.ts`. `connectionExtrasSchema` in `packages/contracts/src/inference/connection.ts` is the shallow `jsonObjectSchema`, so nothing bounds the nesting before the walk. A member can supply deep JSON only on their own connection. The one reach past their own embeddings is the boot loop in `packages/server/src/domain/embeddings/verbs/stale-generation-owners.ts`: it calls `generationIdOf` for each owner with no per-owner catch, so one deep row skips the boot re-index catch-up for every owner (multi-user mode only). The client walks in `packages/client/src/features/automation/lib/rule-save-session.ts`, `packages/client/src/features/chat/lib/turn-warning-cadence.ts` and `packages/client/src/forms/entity-form-base.ts` take the owner's own form values. Every other caller walks a typed or schema-closed shape, and the card door is now bounded at the parse.

## Why

A recursion limit that depends on the host's stack makes a fingerprint fail or pass by machine, and one owner's row must not stop another owner's boot catch-up.

## Done when

Connection JSON from a member is bounded by `nestsPastJsonMaxDepth` or `boundedJsonObjectSchema` at the write, or the walk is iterative. Separately, `staleGenerationOwners` isolates each owner, so one owner's failure is logged and the loop goes on to the rest. One case saves a value a level past the bound and gets a typed refusal; another case has one failing owner and proves the others are still reported stale.

## Evidence

Filled at landing: what ran and where its output is.
