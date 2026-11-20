---
kind: tooling
status: open
updated: 2026-11-15
priority: P3
area: tests
---

# A cancelled stream in the Node suite prints a stack trace

## What

The loopback provider in `tests/support/node/surface-provider.ts` writes a stack trace to stderr when a test cancels a stream on purpose. The tests assert the cancellation and pass.

## Why

The traces read as failures in the CI Node job log and bury a real one.

## Done when

An expected cancellation prints nothing, and an unexpected provider error still prints.

## Evidence

Filled at landing: what ran and where its output is.
