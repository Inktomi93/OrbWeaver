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

The server verbs duplicateMessage, reattributeMessages and listForks have no client caller (items 1500 Evidence). Wire Duplicate into the message menu, a host Reattribute action, and a fork list in the chat details panel. The persona tools already offer a reattribute option: find it, and make one reattribute path that both use rather than a second one. Check where SillyTavern places duplicate, reattribute and branch lists and follow its placement where our layout allows.

## Why

Owner ruling: these are wanted features, built server-side and never surfaced.

## Done when

Each action is reachable from the UI and runs the production verb; one reattribute path serves persona work and the message action; CTs mount each action through the production surface; side-eye passes the placements.

## Evidence

Filled at landing: what ran and where its output is.
