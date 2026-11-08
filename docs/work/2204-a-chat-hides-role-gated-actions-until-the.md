---
kind: bug
status: open
updated: 2026-11-08
priority: P2
area: client
plan: cross-surface-consistency
---

# A chat hides role-gated actions until the viewer's role is known

## What

While a chat is still loading, the viewer's role is unknown and Chat options shows the host menu, so a member can briefly see Rename and Delete chat for everyone. The server still refuses both. Show role-gated actions only once the role is known.

## Why

A member who taps a host action during load gets a refusal for an action they were never offered by design.

## Done when

During load, Chat options shows no role-gated action for any viewer, and after load each role sees its own actions, with a CT that holds the chat load open.

## Evidence

Filled at landing: what ran and where its output is.
