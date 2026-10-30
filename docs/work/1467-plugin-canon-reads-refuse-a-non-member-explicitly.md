---
kind: bug
status: open
updated: 2026-10-30
priority: P2
area: security
---

# Plugin canon reads refuse a non-member explicitly instead of failing on a TypeError

## What

With the visibility check removed, the bridge's canon read for a non-member installer throws a TypeError rather than returning nothing, so it fails closed by accident. Found by the 1459 lane's planted defect. The read should refuse or return empty through an explicit check.

## Why

A fail-closed outcome that depends on a crash breaks the moment the null path changes.

## Done when

The canon read returns the explicit empty or refusal for a non-member, and the room-reads suite asserts that outcome rather than any error. Route to security-executor.

## Evidence

Filled at landing: what ran and where its output is.
