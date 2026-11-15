---
kind: bug
status: doing
updated: 2026-11-15
priority: P1
area: chat
lane: wt/agent-a7694db56bfbc1d14
---

# A failed reply says the message could not be sent while the message is already in the room

## What

When the provider refuses a turn, for example a rejected key, the user's line posts to the transcript and a toast says "Couldn't send your message." The server's plain refusal, which names the cause and where to fix it, reaches only the console. The turn mutation toast falls back to generic copy for this case. The composer then gives no sign that the connection's key is dead, and Send stays enabled.

## Why

The user is told the opposite of what they see and given nothing to do, so every retry fails the same way with the same useless message.

## Done when

A provider refusal shows the server's plain reason, says the message was saved and the reply failed, and links to the connection. The composer states that the bound connection's key was rejected. A test drives a credential refusal and asserts the shown text.

## Evidence

Filled at landing: what ran and where its output is.
