---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: chat
plan: test-foundation
---

# No navigation test covers a card link of a scheme the frame script leaves alone under the app policy

## What

`tests/ui/content/sandbox-frame/` has no case for a card link with a `data:` or custom scheme, which the frame script leaves to its default, under the served app policy.

## Why

Those are the only card links that can still try to navigate the frame.

## Done when

A case asserts no request lands and the card stays drawn for such a link under the served app policy.

## Evidence

Filled at landing: what ran and where its output is.
