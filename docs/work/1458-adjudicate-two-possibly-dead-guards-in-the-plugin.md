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

Restoration batch 5 adds three more whose removal changed no output: the openai-compat shaper's effort strip on a row that spells no effort field, the endpoint inspector's `failure === undefined` term in `ok` (the catch arm already returns false), and the rpg import's existing-game pre-check (the unique-constraint arm returns the same outcome).

## Why

Unwired code is a question about intent: wire it, keep it with a cited reason, or delete it.

## Done when

Each guard is proven reachable with a test through production, kept with a cited ledger reason, or deleted with its callers.

## Evidence

Filled at landing: what ran and where its output is.
