---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: chat
---

# The chat book and regex racks list an attachment the room no longer applies

## What

After a handoff, the chat book rack and the regex script rack still list an attachment the room no longer applies, because the present host does not own it. Ruling: the racks hide such an attachment. They do not show it marked as not applied. The read side already applies an attachment only when the present host owns it (D64); the rack lists must use the same owner check.

## Why

The rack tells members which books and scripts shape their turns, and a row that applies nothing makes that statement false.

## Done when

The chat book rack and the regex script rack list only attachments the present host owns, through the same owner check the prompt read uses, and a case hands a room off with a former host's attachment left in place and asserts neither rack lists it.

## Evidence

Filled at landing: what ran and where its output is.
