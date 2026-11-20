---
kind: work
status: open
updated: 2026-11-20
priority: P3
area: regex
plan: import-robustness
---

# The regex preview memo and compile gate are fair under load

## What

The context preview memo can cache a regex pass that a load-dependent timeout degraded, and the two compile-probe worker slots are shared by every account, so one account's batch can hold them for about thirty seconds.

## Why

A cached degraded pass outlives the load spike that caused it, and one account can delay every other account's saves.

## Done when

A degraded pass is never cached, the gate shares its slots fairly across accounts, and tests cover both.

## Evidence

Filled at landing: what ran and where its output is.
