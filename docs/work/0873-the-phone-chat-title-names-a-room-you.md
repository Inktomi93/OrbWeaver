---
kind: bug
status: doing
updated: 2026-10-11
priority: P2
area: client
lane: wt/agent-a60f3647a45bd36a0
---

# The phone chat title names a room you renamed

## What

On phones the chat screen title leads with participants (chatRoomTitle), so two rooms with the same cast read identically ('Sabine Ve…' at 390) and a user-set room name never shows for multi-character rooms. Also from the 851/852 side-eye round 3: at 1280 with both panes the participants get about 57px while the name keeps 120px, and a single-tab context pane header shows the tab label ('About') where the pane name would read better.

## Why

The list rows now lead with the user's room name; the phone title should tell rooms apart the same way.

## Done when

The phone chat title leads with the user-set room name when one exists, participants otherwise; the desktop header's participant and name floors are rebalanced so neither collapses to a few letters at 1280 with both panes; a single-tab pane header names the pane; CTs at 320, 390 and 430 and at 1280 both-open.

## Evidence

Filled at landing: what ran and where its output is.
