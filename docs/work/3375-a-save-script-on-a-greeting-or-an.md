---
kind: bug
status: open
updated: 2026-11-15
priority: P1
area: chat
---

# A save script on a greeting or an edit runs retrieval and fails when the embedder refuses

## What

A host's save regex pass on a seeded greeting builds its macro context through the turn's full gather, which runs memory recall and the databank read and embeds a query. The edit re-apply does the same. A provider failure there fails the write, and every such write spends an embed.

## Why

For a host with a save script, starting a chat, adding a character in the greeting window, stepping to a card alternate or editing a message calls the embedder and fails when the embedder is down or refuses. A save pass on a write that is not a turn needs macro values, not retrieval.

## Done when

The gather takes a required argument with three choices: a turn keeps strict retrieval; a save pass on a greeting, an alternate or an edit runs no retrieval when none of its scripts reads the memory or databank macro, and when one does it runs retrieval and reads any failure as empty so the write commits. Node cases on the real doors, with the scripted embedder refusing, show for chat start, a stepped greeting and an edit: scripts that read neither macro never call the embedder; a script that reads one still commits with the macro empty; with the embedder up the macro renders what recall staged. The saved-replies retry component test passes unchanged.

## Evidence

Filled at landing: what ran and where its output is.
