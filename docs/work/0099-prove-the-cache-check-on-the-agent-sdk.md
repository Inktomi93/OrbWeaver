---
kind: work
status: done
updated: 2026-09-23
priority: P3
area: tooling
evidence: aa877709f
---

# Prove the cache check on the agent-sdk route

## What

pnpm cache:check skips the agent-sdk route unless CLAUDE_SUB_PROBE_TOKEN is set or the stage DB holds a claude-sub credential. It has never run live.

## Why

The subscription route shapes messages differently; its cache behavior is unmeasured.

## Done when

One live run of the five cases on agent-sdk with results recorded, or a written reason the route cannot cache.

## Evidence

Filled at landing: what ran and where its output is.
