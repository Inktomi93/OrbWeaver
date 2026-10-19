---
kind: bug
status: open
updated: 2026-10-19
priority: P2
---

# component-type-home returned attribute API test times out on main

## What

On main 980b35b5b5, tests/tooling/floor/code-facts/component-type-home.test.ts fails 'returned attribute API follows exact producer and final JSX spread': it times out at the 5 s default (about 9.5 s measured).

## Why

A red test on main hides any new regression in component ownership, and a timeout gives no verdict at all.

## Done when

The test passes on main through pnpm test:scoped, with the timeout cause fixed or a measured, justified per-test budget, never a blanket raise.

## Evidence

Filled at landing: what ran and where its output is.
