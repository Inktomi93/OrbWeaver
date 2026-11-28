---
kind: work
status: open
updated: 2026-11-28
priority: P2
area: automation
plan: unwired-code
---

# Wire the five reserved chat automation triggers with cascade depth

## What

Automation reserves messageHidden, messagesDeleted, chatUpdated, wiEntryAttached and wiEntryDetached, but nothing fires them and the rule editor hides them. Their chat-bus events carry no automation depth, so a rule's own delete or update would re-enter rules as a depth-0 human act.

## Why

Owner ruling: the triggers stay and get wired. Without depth on the events, wiring them opens a rule loop.

## Done when

Each of the five events carries the automation cascade depth, each trigger fires its rules with the depth guard holding, the rule editor offers them, and int tests prove a firing per trigger plus a rule that deletes messages not re-triggering itself.

## Evidence

Filled at landing: what ran and where its output is.
