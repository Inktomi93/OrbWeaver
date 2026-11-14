---
kind: bug
status: open
updated: 2026-11-14
priority: P1
area: chat
---

# A former host cannot change a room's prompt after a handoff

## What

A handoff with no copy offer leaves the outgoing host's chat-attached world books and regex scripts attached to the room. The room reads them by chat id with no owner check, in `packages/server/src/domain/chat/assembly/world-info/pool.ts` and `packages/server/src/domain/regex/persistence/queries.ts`, and they stay owned and editable by the outgoing host, who may have left. The offer shape in `packages/contracts/src/chat/roster.ts` records this and names detach as the new host's remedy. D64 drops the outgoing host's character seats at a handoff for the same reason and says nothing about these attachments. A security review reproduced it: the outgoing host edits a left-behind book and a script after leaving, and the new host's next turn carries the edited text and runs its macros.

## Why

The host controls what the room's model is told. An account that no longer hosts the room, and may no longer sit in it, keeps live write access to the new host's prompt, and the new host is not told.

## Done when

After a handoff, no world book or regex script owned by an account other than the room's host reaches the room's prompt or transforms its turns, whether or not the offer copied them. A server case through the composed root hands a room off with no offer, has the outgoing host edit a left-behind book and a script, and shows the new host's next wire prompt and stored turn unchanged by the edits, with a control where the offer copied them and the copies apply. D64 states the ruling for attachments.

## Evidence

Filled at landing: what ran and where its output is.
