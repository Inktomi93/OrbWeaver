---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: security
---

# A plugin can invoke itself through its own pubsub channel without limit

## What

A plugin's CPU account for work outside an invocation refills when an invocation opens. A plugin can publish to its own pubsub channel, which delivers to itself as a new invocation, with no rate limit and no cascade depth; automation rules have both. Read from code by the leg-six security review of the security lane under reports/review, not measured.

## Why

The outside account bounds leftover work only if the guest cannot open invocations for itself at will. This is the one refill source the guest controls.

## Done when

A real-guest probe first measures whether a self-publishing plugin can hold a core. If it can, self-delivery carries a rate limit and a cascade depth by the same design the automation rules use, with a real-guest test; if it cannot, the item closes with the measurement.

## Evidence

Filled at landing: what ran and where its output is.
