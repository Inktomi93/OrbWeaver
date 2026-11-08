---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: release
---

# The in-app share relay pins the same cloudflared as the compose file

## What

The in-app share relay still pins an older cloudflared than docker/compose.cloudflared.yaml. Give the cloudflared pin one home that both read, and move the relay to it.

## Why

Two pins for one binary drift, and the older one misses the security fixes the compose pin carries.

## Done when

One pin site names the cloudflared version and digest, the share relay and the compose file both resolve it, and a test fails when they differ.

## Evidence

Filled at landing: what ran and where its output is.
