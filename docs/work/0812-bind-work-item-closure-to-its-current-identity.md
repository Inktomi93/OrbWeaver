---
kind: tooling
status: open
updated: 2026-10-09
priority: P2
area: docs
---

# Bind work-item closure to its current identity

## What

Prevent a stale Closes trailer from recommending or automatically landing a different current work item with the same identifier.

## Why

The drift reader accepts a trailer whose commit contains no matching item file. It can bind that trailer to an unrelated later item.

## Done when

Unknown-item trailers cannot automatically land a later item. Native controls preserve valid tracked-item closures and explicit manual landing.

## Evidence

Filled at landing: what ran and where its output is.
