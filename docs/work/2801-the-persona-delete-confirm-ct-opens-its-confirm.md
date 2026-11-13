---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: testing
plan: test-foundation
---

# The persona delete-confirm CT opens its confirm under load

## What

The case "crowned persona also last played" in the persona delete default confirm component test clicks Delete and the confirm never opens in a full-file run under load; alone it passes.

## Why

A click that lands before the control is ready is a wait on the wrong signal, and the case fails without a product defect.

## Done when

The case waits on the state that makes Delete live, with no larger budget, and passes ten full-file runs.

## Evidence

Filled at landing: what ran and where its output is.
