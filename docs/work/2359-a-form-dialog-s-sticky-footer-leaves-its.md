---
kind: bug
status: doing
updated: 2026-11-09
priority: P2
area: ui
lane: wt/agent-a5706bbf36b61b0a3
plan: cross-surface-consistency
---

# A form dialog's sticky footer leaves its fields reachable at 300% text

## What

At 568x320 and 300% text a form dialog's sticky footer is 324px tall in a 286px body, so it covers every field.

## Why

A footer taller than its body hides the form it submits.

## Done when

At 568x320 and 300% the fields scroll into view above the footer, or the footer stops being sticky when it would cover the body, with a CT that fails on main.

## Evidence

Filled at landing: what ran and where its output is.
