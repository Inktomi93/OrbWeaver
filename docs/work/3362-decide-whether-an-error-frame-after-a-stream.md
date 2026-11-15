---
kind: decision
status: open
updated: 2026-11-15
priority: P3
area: inference
plan: cross-surface-consistency
---

# Decide whether an error frame after a stream has begun may revoke a key

## What

A 401 frame in the middle of a stream now strikes the key on every row. Before, every such frame read as a server error.

## Why

There is no evidence either hosted provider relays an upstream 401 mid-stream, so the strike may only ever fire wrongly.

## Done when

A recorded ruling keeps or removes the mid-stream strike, and a case pins it.

## Evidence

Filled at landing: what ran and where its output is.
