---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# A roster case covers a script on a switched-off tier that also runs from an allowed one

## What

Add an On screen roster case: one script attached to a switched-off tier and to an allowed one is listed once, as running, at the allowed tier.

## Why

regexRowHomes homes it at its ranked tier, but no test covers it (tests/client/features/chat/components/regex-on-screen-roster.ct.tsx). Code review of ee979313d0, Combined tip delta (reports/code-reviewer/-cb-review-regex-client.md in agent-a8071996f9c5e8978).

## Done when

The case is red against a model that lists the off occurrence and green on main.

## Evidence

Filled at landing: what ran and where its output is.
