---
kind: bug
status: open
updated: 2026-11-15
priority: P1
area: connections
---

# A connection whose key the provider rejected breaks the whole Connections page

## What

After a turn on a key the provider refuses, the key is marked revoked. The bindings read then fails with "No openai credential". Settings, Connections shows "Couldn't load your connections." and "Couldn't load your model roles.", and Retry fails the same way. The only way out is Clear revoked on the dead key, then a reload, and nothing on screen points there.

## Why

The page a user needs in order to move Chat to another connection is the one that will not load, so a single expired key locks them out of fixing it.

## Done when

With a revoked key bound to Chat, the connections list and the model roles both render. The affected connection and the Chat role picker show the key as rejected, with Replace and a way to pick another connection. A CT revokes a bound key and asserts that both lists render.

## Evidence

Filled at landing: what ran and where its output is.
