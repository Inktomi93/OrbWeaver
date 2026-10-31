---
kind: work
status: open
updated: 2026-10-30
priority: P3
area: connection
---

# Adjudicate possibly dead guards the restoration lanes found

## What

packages/server/src/domain/connection/persistence/provider-rows.ts: the post-write re-read in replacePluginProviderRows (a plugin claims only ids under its own manifest id and (owner, slug) is unique, so no production path races two claims of one id), and the orphan reap branch in reconcilePluginClaims (no verb deletes a user; only a raw cascade would reach it). The plugin restoration lane adds a third: the pre-batch conflictingProviderDefinition check in replacePluginProviderRows changes no observable output, because the post-batch raced check still refuses a changed definition. The restoration lanes could not reach these through production.

Restoration batch 5 adds three more whose removal changed no output: the openai-compat shaper's effort strip on a row that spells no effort field, the endpoint inspector's `failure === undefined` term in `ok` (the catch arm already returns false), and the embeddings indexer's `contentChanged` skip in `onCharacterUpdated` (the store's content-hash gate alone gave the same rows and requests in the autoindex gate case). The batch 5 review confirmed the first two dead. (The rpg import's existing-game pre-check was also listed; review proved it live, so it is not in scope.)

## Why

Unwired code is a question about intent: wire it, keep it with a cited reason, or delete it.

## Done when

Each guard is proven reachable with a test through production, kept with a cited ledger reason, or deleted with its callers.

## Evidence

Each guard was removed in a planted run of provider-rows, provider-contributions, body-shaping, endpoint-inspection and autoindex-gate, then decided.

| Guard | Decision | Proof |
| - | - | - |
| Pre-batch `conflictingProviderDefinition` check in `replacePluginProviderRows` | Reachable, kept | Removed with the re-read in place, the changed-definition case in `tests/server/domain/connection/persistence/provider-rows.int.test.ts` fails: the new definition row lands before the refusal. ADR 265 states the refusal. |
| Post-write re-read in `replacePluginProviderRows` | Deleted | A plugin claims only ids under its own slug (`validatePluginRows`), an owner holds one install per slug, and `createPluginLifecycleLanes` runs one install's activations one at a time, so no second writer races an owner's claim. Removed, all five suites stay green with no test change. |
| Orphan reap in `reconcilePluginClaims` | Reachable, kept | ADR 265 deletes a claim with its user and has reconciliation reap an unclaimed definition. New persistence case deletes owner rows: the shared definition stays while one claim names it, and the next read reaps it after the last. Removed, that case fails at the final count. |
| openai-compat shaper effort strip | Deleted | `compatibleReasoning` writes the effort word only on a row that spells `reasoning_effort`, and no other writer on this transport sets `reasoning`. The row-level drop and the warning stay with `compatibleReasoning`. Removed, body-shaping and endpoint-inspection stay green. |
| Inspector `failure === undefined` term in `ok` | Deleted with the `failure` parameter | The catch arm returns `ok: false`. Removed, endpoint-inspection stays green. |
| Embeddings indexer `contentChanged` skip | Reachable, kept | New autoindex-gate case: a card written unindexed, a star toggle with indexing on writes no row and sends no embedding request, and a content edit then indexes it. Removed, the case fails because the store's hash gate embeds the unindexed card. |

Commands: `pnpm test` on the five suites passed before and after (31 tests before; 33 after with the two new cases and no changed case). Plant results: pre-check removal red at `provider-rows.int.test.ts:149`, reap removal red at `:178`, skip removal red in the new autoindex-gate case.
