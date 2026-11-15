---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: server
---

# Plugin URL installs and pinned downloads take a caller cancel

## What

fetchPluginBundleFor (`packages/server/src/infra/network/egress.ts`) and fetchPinnedDownloadFor create their own signal, because the plugin URL verbs preview-from-url, check-for-updates, upgrade-from-stored-url and install-from-url and the relay binary download take no cancel.

## Why

A cancelled plugin install or update check keeps downloading until the deadline ends the fetch.

## Done when

Both doors take a required signal and their callers thread the request or workload signal.

## Evidence

Filled at landing: what ran and where its output is.
