---
kind: bug
status: open
updated: 2026-11-27
priority: P3
area: client
---

# A throttled reachability check says the app paused the check, not that the provider is rate-limiting

## What

packages/client/src/features/credentials/components/connection-reachability.tsx says the provider is rate-limiting us when the answer is the app's own check window, which reuses the last check.

## Why

The copy blames the provider for the app's own throttle, so a person may chase a provider limit that does not exist.

## Done when

The throttled state names the app's own wait and when the next check can run, checked in a CT render.

## Evidence

Filled at landing: what ran and where its output is.
