---
kind: work
status: open
updated: 2026-10-31
priority: P2
area: chat
plan: unwired-code
---

# Wire duplicate, reattribute and the fork list into the chat UI

## What

The server verbs duplicateMessage, reattributeMessages and listForks have no client caller (items 1500 Evidence). Wire Duplicate into the message menu, a per-message Reattribute action in the message menu, and a fork list in the chat details panel. The persona tools already reattribute a whole chat; the message action reattributes one message. Keep both. They share one server path where the whole-chat action can call the per-message verb; do not build a second write path. Check where SillyTavern places duplicate, reattribute and branch lists and follow its placement where our layout allows.

## Why

Owner ruling: these are wanted features, built server-side and never surfaced.

## Done when

Each action is reachable from the UI and runs the production verb; the per-message and whole-chat reattribute actions write through one server path; CTs mount each action through the production surface; side-eye passes the placements.

## Evidence

Filled at landing: what ran and where its output is.
