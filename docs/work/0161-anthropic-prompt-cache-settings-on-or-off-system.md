---
kind: work
status: open
updated: 2026-09-24
priority: P2
area: inference
---

# Anthropic prompt-cache settings: on or off, system block, depth, TTL

## What

Add user-facing cache settings, shown only on connections whose capability has explicitPromptCache: caching on or off, cache the static system block or not, history breakpoint depth, and TTL 5m or 1h. The TTL is hardcoded 1h today (SHIPPED_CACHE_TTL in packages/inference/src/backends/kit/cache-control.ts). The only depth control is the admin floor promptCacheMinDepth.

## Why

Owner request. A 1h write costs 2x base input against 1.25x for 5m, so short sessions should be able to pick 5m. Some users do not want the system prompt cached.

## Done when

The settings reach the wire on direct Anthropic and OpenRouter-Anthropic. Wire-capture tests cover each value. A direct-Anthropic 1h TTL sends whatever header the API requires, verified against the current docs.

## Evidence

Filled at landing: what ran and where its output is.
