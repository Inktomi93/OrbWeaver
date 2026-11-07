---
kind: bug
status: doing
updated: 2026-11-07
priority: P2
area: client
lane: wt/agent-a5a6754c31412b587
plan: cross-surface-consistency
---

# The Temporary badge is hidden in the phone topbar on the temp tile path

## What

tests/e2e/corpus-home-launch.spec.ts fails the temp tile case in every phone chat-style cell on unmodified source, because the Temporary badge in the shell topbar is not visible. Decide whether the phone topbar must show it or the case must read the phone's real surface.

## Why

A person on a phone cannot tell a temporary chat from a saved one if the badge is hidden, and a red spec hides later regressions on that path.

## Done when

The phone cells pass, and a person on a phone can see that a chat is temporary.

## Evidence

Filled at landing: what ran and where its output is.
