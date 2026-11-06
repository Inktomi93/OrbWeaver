---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: connection
---

# Disable Add connection until a provider is picked

## What

The Add connection button in `packages/client/src/features/credentials/components/add-connection-dialog.tsx` is enabled while the provider is still Pick a provider.

## Why

The primary action invites a press that can only fail.

## Done when

The button is disabled until a provider is picked, and a CT pins both states.

## Evidence

Filled at landing: what ran and where its output is.
