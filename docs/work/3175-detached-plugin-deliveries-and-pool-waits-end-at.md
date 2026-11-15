---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: plugin
---

# Detached plugin deliveries and pool waits end at shutdown

## What

Plugin pub-sub and trigger-fact deliveries (the deliver invoker in `packages/server/src/domain/plugin/activation/activate.ts`) and the plugin pool acquires (`packages/server/src/infra/plugin-host/process-runtime.ts`) run under created signals that nothing can abort.

## Why

A shutdown waits for a queued delivery or a pool lease that no cancel reaches, bounded only by the invocation budget.

## Done when

Each site takes the background signal that ends at shutdown, or its comment names the bound that makes a cancel unneeded.

## Evidence

Filled at landing: what ran and where its output is.
