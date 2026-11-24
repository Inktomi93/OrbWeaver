---
kind: bug
status: open
updated: 2026-11-24
priority: P3
area: testing
plan: test-foundation
---

# The config collection retry CT routes every procedure the page calls

## What

The config-collection-retry component test fails with routeTrpc reporting regex.listUnattached as an unhandled procedure; it fails the same way on main without any recent change to the collection group.

## Why

A red CT in a suite nobody reads trains lanes to ignore it and hides a real regression behind it.

## Done when

The CT's tRPC routing handles every procedure the config page calls through the house routing helper, and the CT passes.

## Evidence

Filled at landing: what ran and where its output is.
