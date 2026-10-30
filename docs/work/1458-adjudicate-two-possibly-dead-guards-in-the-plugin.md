---
kind: work
status: open
updated: 2026-10-30
priority: P3
area: connection
---

# Adjudicate two possibly dead guards in the plugin provider rows

## What

packages/server/src/domain/connection/persistence/provider-rows.ts: the post-write re-read in replacePluginProviderRows (a plugin claims only ids under its own manifest id and (owner, slug) is unique, so no production path races two claims of one id), and the orphan reap branch in reconcilePluginClaims (no verb deletes a user; only a raw cascade would reach it). The serde restoration lane could not reach either through production.

## Why

Unwired code is a question about intent: wire it, keep it with a cited reason, or delete it.

## Done when

Each guard is proven reachable with a test through production, kept with a cited ledger reason, or deleted with its callers.

## Evidence

Filled at landing: what ran and where its output is.
