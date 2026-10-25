---
kind: work
status: open
updated: 2026-10-25
priority: P3
area: client
plan: test-foundation
---

# Confirmation-identity CT releases its plugin hold through the real host

## What

tests/client confirmation-identity.ct.tsx holds a plugin route and releases it with a hand value, refresh.release({ resultJson: '"refreshed"' }). Install a real plugin with a UI entry in the CT corpus and release the hold through the server's plugin host, so the result is the plugin's real output.

## Why

Spine-Testing §9 bans minted results. The plugin host is our own WASM sandbox, so it is product code, not an external boundary.

## Done when

The CT releases through holdServed with the real plugin call, and orb/ct-responder-reads-input judges it with no exception.

## Evidence

Filled at landing: what ran and where its output is.
