---
kind: work
status: doing
updated: 2026-11-08
priority: P3
area: server
lane: wt/agent-a9db028f1d127e510
plan: test-foundation
---

# Shutdown log messages have one home

## What

The shutdown log messages in packages/server/src/entry/lifecycle.ts and the tooling verdicts are spelled inline, and lifecycle.int.test.ts restates them.

## Why

A restated message drifts from the production one and the test still passes.

## Done when

One constant per message, read by production and the test.

## Evidence

Filled at landing: what ran and where its output is.
