---
kind: work
status: doing
updated: 2026-11-20
priority: P3
area: chat
lane: wt/agent-a8c72080671572f19
plan: chat-html-and-presets
---

# The card-script verdict reads viewer settings only when it needs them, and its docs match

## What

Since the verdict moved into resolveCardScriptVerdict, the card-frame mint and serve read the viewer's settings for every named-character card, so a failed read now fails every such card closed, not only ones eligible for scripts; the doc in the chat domain's card-frame route still states the old scope, and no test covers a failed read. The verdict's doc in packages/contracts/src/chat/roster.ts says the notice and the frame always agree, but a reused handle can keep an earlier grant, so the two can disagree for display.

## Why

A wider failure scope than needed turns one bad settings read into blank cards across a room, and a doc that promises agreement the code does not give misleads the next change.

## Done when

The settings read runs only when the install and character steps allow scripts, or the wider scope is ruled and the card-frame doc says so; a test covers a failed read; the roster doc states when the notice and the frame can differ, or the notice reads the mint's grant.

## Evidence

Filled at landing: what ran and where its output is.
