---
kind: work
status: open
updated: 2026-11-25
priority: P3
area: plugin
plan: test-foundation
---

# A failed host-error build on the plugin membrane's async settle path disposes its deferred, under a deterministic case

## What

settleGuestPromise in packages/server/src/infra/plugin-host/membrane.ts disposes the guest deferred when building its host error fails, but that build fails only when the engine interrupt lands inside the brand call, which no production door can force; removing the dispose survives every membrane suite.

## Why

An undisposed deferred aborts the plugin's engine at teardown, and nothing would catch the dispose being removed.

## Done when

A case drives the settle path with a host-error build that fails, through a testkit helper or reach entry rather than a production export, and goes red with the dispose removed.

## Evidence

Filled at landing: what ran and where its output is.
