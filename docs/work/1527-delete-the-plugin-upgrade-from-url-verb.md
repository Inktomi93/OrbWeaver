---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: plugin
plan: unwired-code
---

# Delete the plugin upgrade from URL verb

## What

PluginService.upgradeFromUrl has no caller; the stored-URL upgrade covers the case. Delete it with its router and contract members, unless a guest can reach it through the host ABI.

## Why

Owner ruling: delete.

## Done when

pnpm unwired no longer reports it; typecheck and the plugin suites pass.

## Evidence

Filled at landing: what ran and where its output is.
