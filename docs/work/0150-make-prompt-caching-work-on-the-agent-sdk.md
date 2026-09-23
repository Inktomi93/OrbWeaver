---
kind: bug
status: blocked
updated: 2026-09-23
priority: P2
area: inference
blocked: owner
---

# Make prompt caching work on the agent-sdk route

## What

On the agent-sdk route every per-speaker call in a group round forks a fresh session: cache-check turns 9-14 (all forked) read 0 and write about 18.8k tokens each, so group rounds cache nothing across speakers.

## Why

Direct and OpenRouter will share one cached prefix per round once the same-role layout fix lands; the subscription route should behave the same.

## Done when

Consecutive speaker calls in a group round on agent-sdk read the previous call's prefix from cache (pnpm cache:check group case passes on agent-sdk), with a runner test for the fork/resume decision.

## Evidence

Filled at landing: what ran and where its output is.
