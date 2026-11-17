---
kind: work
status: open
updated: 2026-11-17
area: inference
---

# Google continuationToken: fully wire the round-trip

## What

A truncated Google reply carries a continuationToken (the provider dist emits it and even auto-continues, js:229-232). We neither read nor send it. Owner ruling: fully wire it — read the token from provider metadata, continue the generation, reconciled with the output-cap law by the lane (read the cap law before touching semantics).

## Why

A long Google reply truncates and the existing cap handling treats truncation as terminal while the SDK ships the remedy.

## Done when

A truncated Google stream continues via continuationToken through the real call path, the cap law is honored or amended in the same commit, a wire-level test proves the round-trip.

## Evidence

Filled at landing: what ran and where its output is.
