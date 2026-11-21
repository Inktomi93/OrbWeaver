---
kind: bug
status: doing
updated: 2026-11-21
priority: P1
area: chat
lane: wt/agent-a773afb96490b32db
plan: chat-html-and-presets
---

# A failed turn names its cause and the action that failed

## What

A turn that ran out of output tokens on thinking showed only Couldn't generate a guided response for a few seconds; it names the wrong action and the actionable cause is only in the console.

## Why

The user cannot tell what failed or what to change.

## Done when

A failed turn shows which action failed and the cause the server returned (here the output limit spent on thinking) with the setting to change, inline where the turn was, with a CT per failure kind the server returns.

## Evidence

Filled at landing: what ran and where its output is.
