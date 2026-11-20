---
kind: decision
status: doing
updated: 2026-11-20
priority: P3
area: chat
lane: wt/agent-a5e5717c910efab00
plan: chat-html-and-presets
---

# Decide whether a reply cut by a server shutdown keeps its partial text

## What

A server shutdown aborts a running turn with its own reason, distinct from a member Stop, so an owed reply it cuts stays queued. Stop-keeps applies only to a member Stop, so a shutdown also discards the partial text of an ordinary reply that had already streamed. Options: discard, or keep the partial text as a reply marked interrupted by the server, for turns that are not owed.

## Why

A restart during generation throws away text the member watched arrive and that was already billed.

## Done when

A recorded ruling says what a shutdown does to the partial text of a turn that is not owed, and the code and a test follow it.

## Evidence

Filled at landing: what ran and where its output is.
