---
kind: work
status: open
updated: 2026-11-15
priority: P3
---

# A guest in a shared room sees a styled reply at the same tier

## What

The styled-reply CT drives the owner's view only. The tier comes from resolveRowRenderPolicy and the mint re-derives the policy server-side from the membership-gated roster, but no CT mounts a member's view of a framed reply.

## Why

Acceptance asked for a guest case; it needs a member session, the host's display-script broadcast, and the member's own mint.

## Done when

A CT signs in a member of a shared room with the host's display scripts broadcast and asserts the member sees the same frame or inert path the host sees, and that the member cannot raise the row's tier.

## Evidence

Filled at landing: what ran and where its output is.
