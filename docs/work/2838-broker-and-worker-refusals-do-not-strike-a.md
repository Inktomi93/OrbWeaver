---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: plugins
plan: authorization-and-visibility
---

# Broker and Worker refusals do not strike a plugin when uncaught

## What

The app records every host refusal it raises, so an uncaught one costs the plugin no strike. Three refusals raised elsewhere still strike when uncaught: a sync-call result refused by a full channel in `packages/server/src/infra/plugin-host/process-runtime.ts`, and the broker's and the Worker's own channel-full and timeout refusals. No test drives an uncaught channel-full flood outside the slow-tagged flood suite.

## Why

A plugin is charged a crash for a refusal the host raised, which the SDK text now has to name as an exception.

## Done when

A Worker-side record covers those refusals, the SDK text drops the exception, and a test drives an uncaught channel-full refusal and fails when the record is removed.

## Evidence

Filled at landing: what ran and where its output is.
