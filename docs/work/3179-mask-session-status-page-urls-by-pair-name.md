---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: tooling
plan: snap-secret-hygiene
---

# Mask session-status page URLs by pair name as well as by value

## What

`tooling/src/snap/ops/session-daemon-request.ts` scrubs the page URLs it reports for session status by value only, and `tooling/src/snap/ops/session-admin.ts` prints them. A token the run never noted, such as an OAuth `?code=` after a redirect or an invite the app minted, prints raw.

## Why

The value scrub knows only what the run revealed, while the pair mask in `tooling/src/snap/lib/disk-safe-argv.ts` catches a sensitive name whatever its value.

## Done when

The status page URL goes through `diskSafeUrl` after the value scrub, with a red-first canary that the run never noted.

## Evidence

Filled at landing: what ran and where its output is.
