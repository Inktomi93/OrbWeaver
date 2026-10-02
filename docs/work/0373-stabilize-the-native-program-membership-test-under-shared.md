---
kind: tooling
status: open
updated: 2026-10-02
priority: P3
area: verify
---

# Stabilize the native program membership test under shared execution

## What

Align the real-repository program-membership test with the shared-host execution and timeout policy. Preserve its compiler-roster and owned-file assertions.

## Why

The affected tooling run exceeded the default timeout. The unchanged test passed in isolation with the same timeout, indicating sensitivity to concurrent execution.

## Done when

The real-program check runs reliably through its declared execution group. Focused proof preserves every existing assertion without suppression or a blanket timeout increase.

## Evidence

Filled at landing: what ran and where its output is.
