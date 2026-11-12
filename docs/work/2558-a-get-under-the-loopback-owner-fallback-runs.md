---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: security
plan: authorization-and-visibility
---

# A GET under the loopback owner fallback runs a deferred-turn drain with no cross-site check

## What

No CSRF control covers GET. Under the loopback owner fallback, a plain GET to the stream connect procedure with no headers answers and runs the deferred-turn drain and marks the user online. Model-calling GET procedures exist but need ids an outside page would not know. Measured by the second security review of the route checker branch under reports/review.

## Why

A read that writes is reachable by any page loaded in the box's own browser wherever the owner fallback is live, which is every single-user install and dev stack.

## Done when

Each tRPC query and subscription is listed with whether it writes. One that writes either stops writing on GET, or requires proof a cross-site page cannot supply, by a recorded decision. A test drives each writing GET cross-site under the fallback and asserts no state change.

## Evidence

Filled at landing: what ran and where its output is.
