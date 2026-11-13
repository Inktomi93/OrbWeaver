---
kind: tooling
status: open
updated: 2026-11-13
priority: P3
area: tooling
plan: authorization-and-visibility
---

# sse-tap sends the cross-site header

## What

`pnpm sse-tap` opens a header-less GET through Node's EventSource, which the subscription rule now refuses. Sending a header needs an EventSource that accepts one, which is a tooling dependency and a lockfile change.

## Why

The tool that watches a live stream no longer connects.

## Done when

`pnpm sse-tap` connects to a running stack again and sends the header.

## Evidence

Filled at landing: what ran and where its output is.
