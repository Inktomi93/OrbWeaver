---
kind: work
status: open
updated: 2026-11-22
priority: P3
area: client
plan: unwired-code
---

# Admin surfaces show who published a plugin and who added a provider

## What

adminDistributedPlugins.distributedBy and providerRows.originUserId are written as provenance and never projected.

## Why

Owner ruling names the provider record as a place to show collected data. A code comment that hides the publisher is not a ruling.

## Done when

The distribute surface and the provider record show the publishing or adding admin by handle, with a deleted admin shown as such, through the existing projections.

## Evidence

Filled at landing: what ran and where its output is.
