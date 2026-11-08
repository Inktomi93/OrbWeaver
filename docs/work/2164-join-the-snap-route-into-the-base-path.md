---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: tooling
---

# Join the snap route into the base path instead of after its query

## What

A --base with a query plus a route yields ?token=T/, so the browser sends T/ and noteUrlSecrets notes T/ rather than T.

## Why

A page that echoes the bare token would not be scrubbed.

## Done when

The route joins the base path, or a --base with a query is refused together with a route.

## Evidence

Filled at landing: what ran and where its output is.
