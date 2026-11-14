---
kind: work
status: open
updated: 2026-11-14
priority: P2
area: chat
---

# Carry a player's correction forward as a standing fact

## What

The Rewrite dialog can save its correction as a chat injection, so every later turn of the chat receives it in the player's words. The saved correction shows and is removed in the chat's injections list. The memory view lists saved corrections when item 1977 builds it.

## Why

A model that keeps forgetting one fact needs the same correction on every rewrite today.

## Done when

a server case through the composed root saves a correction from the rewrite path, the next turn's prompt carries it, and removing the injection drops it from the turn after. A CT on the Rewrite dialog shows the save control and the saved injection in the injections list.

## Evidence

Filled at landing: what ran and where its output is.
