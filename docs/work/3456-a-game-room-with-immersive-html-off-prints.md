---
kind: work
status: open
updated: 2026-11-16
priority: P1
area: chat
plan: chat-html-and-presets
---

# A game room with immersive HTML off prints card markup as text with no notice

## What

In a game chat with the immersive HTML feature off, raw HTML that would be wrapped as a card stays literal text or a code block. Nothing tells the host that a room switch would render it. Detecting a would-be card needs a new detector pass.

## Why

A host sees markup soup and does not know one room switch fixes it.

## Done when

When a reply in a game room holds markup the lenient card wrap would take, the host sees the shared notice with a control that opens the room's feature switch. A member sees the reason with no control. A reply with no such markup shows none.

## Evidence

Filled at landing: what ran and where its output is.
