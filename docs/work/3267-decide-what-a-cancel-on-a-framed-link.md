---
kind: bug
status: doing
updated: 2026-11-15
priority: P1
area: chat
lane: wt/agent-ab44fb1e85a108193
plan: import-robustness
---

# Decide what a Cancel on a framed link mutes

## What

After a reader cancels the confirm a framed reply's link raises, every link in that reply does nothing until the room is reopened. D354 rules that a Cancel mutes the frame's links until it remounts. The owner ruled this is a defect: a Cancel closes the confirm and changes nothing else.

## Why

A control that silently stops working reads as broken, and the reader cannot tell a muted link from a dead one.

## Done when

A CT cancels one framed link, then activates the same link and a second link, and each raises the confirm again. A frame that asks for navigation repeatedly with no reader gesture is bounded, with a case. D354 is amended in the same commit.

## Evidence

Filled at landing: what ran and where its output is.
