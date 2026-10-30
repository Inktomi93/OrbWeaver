---
kind: work
status: open
updated: 2026-10-30
priority: P3
area: connection
---

# Adjudicate three possibly dead guards in the plugin provider rows

## What

packages/server/src/domain/connection/persistence/provider-rows.ts: the post-write re-read in replacePluginProviderRows (a plugin claims only ids under its own manifest id and (owner, slug) is unique, so no production path races two claims of one id), and the orphan reap branch in reconcilePluginClaims (no verb deletes a user; only a raw cascade would reach it). The plugin restoration lane adds a third: the pre-batch conflictingProviderDefinition check in replacePluginProviderRows changes no observable output, because the post-batch raced check still refuses a changed definition. The restoration lanes could not reach these through production.

## Why

Unwired code is a question about intent: wire it, keep it with a cited reason, or delete it.

## Done when

Each guard is proven reachable with a test through production, kept with a cited ledger reason, or deleted with its callers.

## Evidence

Filled at landing: what ran and where its output is.
