---
kind: work
status: doing
updated: 2026-11-20
priority: P1
area: chat
lane: wt/agent-abf28919555a27932
---

# A shared room can wait for every human before the characters reply

## What

In a room with two or more humans, the host can turn on a mode where a human's send posts the message without starting a reply, and the characters answer once every present human has written since the last reply. Today the only way is Simple send plus a manual Generate reply, which only unlocks after the first normal message, and group behavior settings show only with two or more characters, so a room with one character and two people has no setting for it at all. Decide who counts as present (seated, online, not idle), what the waiting humans see (who the room is waiting on), how the host or the last writer can release the reply early, and how it interacts with swipes, regenerate and the existing response modes.

## Why

A real user plays one character with a second person and asked for exactly this; the owner said the mode would be built. The workaround is three steps per turn and is gated in a way the user could not find.

## Done when

The host can turn the mode on in a room with one or more characters and two or more humans; each human's send posts without a reply; the reply starts when the last present human writes or when someone releases it; every waiting member sees who the room is waiting on; an integration case drives two members through the real verbs and sees exactly one reply after both write, and a component test covers the waiting line. After it ships, the Rooms-and-Group-Chats wiki page says where the switch lives, that only the host sees it, and that it appears once a second person is seated in the room.

## Evidence

Filled at landing: what ran and where its output is.
