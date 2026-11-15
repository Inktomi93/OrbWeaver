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

The gather takes a required argument that states whether the caller wants retrieval; the greeting helper and both edit sites build the macro context with no memory recall and no databank read. A Node case on the real door starts a chat and steps a greeting for a host with a save script and an attached document while the scripted embedder refuses: the write succeeds and the embedder was never called. The saved-replies retry component test passes unchanged.

## Evidence

Filled at landing: what ran and where its output is.
