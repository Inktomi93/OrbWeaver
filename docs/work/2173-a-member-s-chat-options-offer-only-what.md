---
kind: bug
status: doing
updated: 2026-11-08
priority: P2
area: client
lane: wt/agent-aeb8f21def3afc3d1
plan: cross-surface-consistency
---

# A member's chat options offer only what a member can do

## What

A member's Chat options menu offers Rename and Delete chat for everyone; the server refuses the delete with a 400 and a generic message. Leave is only in the member's row menu on the Members tab. Show a member the actions their role allows, including Leave.

## Why

A menu that offers an action the server refuses reads as broken and hides the action the member actually has.

## Done when

A member's Chat options show Leave and no host-only action, the host's menu is unchanged, and a CT covers both roles. Source: acceptance part 2 report M2.

## Evidence

Filled at landing: what ran and where its output is.
