---
kind: work
status: open
updated: 2026-11-17
area: inference
---

# Anthropic per-iteration cost attribution (condition for re-listing fallbacks)

## What

The anthropic extras allowlist dropped fallbacks and contextManagement because a fallback or context edit bills per iteration and the cost fold in backends/v4/result.ts ignores the provider's iterations rows, so cost is silently underreported. When a lane can sum iterations into the usage contract with a test, the keys may return to the allowlist.

## Why

The extras surface may not carry a key whose effect the billing math miscounts; the owner banned them until the math closes.

## Done when

iterations rows fold into usage with a test proving a two-iteration fallback bills both, and the extras test shows the keys accepted again.

## Evidence

Filled at landing: what ran and where its output is.
