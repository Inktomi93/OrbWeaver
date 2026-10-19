---
kind: tooling
status: doing
updated: 2026-10-19
priority: P3
area: tooling
lane: wt/agent-acb14f15173490df8
plan: test-foundation
---

# Caching probe scripted mode completes its scenarios

## What

The caching probe's --scripted mode fails every scenario with stream ended without a finish part, on main and after the Principal adoption.

## Why

The probe's offline mode is its only no-network check and currently proves nothing.

## Done when

\--scripted completes every scenario offline.

## Evidence

Filled at landing: what ran and where its output is.
