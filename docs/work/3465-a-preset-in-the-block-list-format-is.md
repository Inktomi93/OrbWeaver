---
kind: bug
status: doing
updated: 2026-11-15
priority: P2
area: import
lane: wt/agent-ae0fdd0e39a57d5b8
---

# A preset in the block-list format is refused whole and the refusal does not say what it expected

## What

A preset file that is not the SillyTavern chat-completion shape is refused by the single-file preset import with a message that names only that shape and its field names. Say plainly that the file format is not recognized and which exports the app accepts. Importing other preset formats is out of scope.

## Why

A person who picks the wrong export gets a message about field names and cannot tell whether the file or the app is wrong.

## Done when

The refusal says the format is not recognized and names the accepted exports, in words a reader with no knowledge of the file shape can act on. A test feeds a small synthetic file of another shape through the import and reads the refusal kind, not its copy.

## Evidence

Filled at landing: what ran and where its output is.
