---
kind: adr
status: active
updated: 2026-11-11
---

# A dropped chat event append still fans live when the event closes or invalidates live state

## Context

The chat bus appends every durable event to `chat_events` before it fans the event live. `emit` is total (`FLAG[emit-is-total]`): when the append fails twice on a live chat, the bus logs an error and drops the event. Canon commits in its own batch before the bus emits, so a dropped row loses no message. Without a live fan, every attached device waits on a frame that never comes: a dropped `turnCompleted` keeps the turn slot open, Stop replaces Send, and a Stop click spins until the device reattaches. A dropped canon announcement from a verb outside a turn leaves other devices on stale canon. A reattach heals both, through `chatOpened.openTurnIds` and the canon read. The engine cannot help: by the time the terminal drops, canon has committed, so failing the turn would report an existing reply as an error.

## Decision

A dropped durable append whose event closes or invalidates live state still fans live with `seq: null`. An event the turn's terminal supersedes does not fan: fanning token text the log never held would break the rule that replay equals live. `DROPPED_APPEND_FANS` in `packages/contracts/src/chat/bus.ts` decides per event type, and its `satisfies Record` makes a new durable type fail `tsc` until it is classified. `emit` stays total and its retry and error log are unchanged; it returns the dropped event as `{ seq: null, event }`, and `null` still means the chat is gone, which never fans. `emitAfterClaim` never fans a failure, because its append shares the claim's batch, so nothing committed. A chat frame with `seq: null` carries no durable cursor: the socket does not advance the room cursor on it, and the client seq guard admits it without touching its high-water mark. Live-only events use the same null cursor. Homes: `fan` in `packages/server/src/domain/chat/substrate/publication.ts`, `emit` in `packages/server/src/domain/chat/bus.ts`, the live loop in `packages/server/src/transport/trpc/stream/sources/chat.ts`, `packages/client/src/data/bus/chat-event-seq-guard.ts`, `tests/server/domain/chat/persistence/dropped-append-fan.int.test.ts` and `tests/client/features/chat/components/turn-terminal-cursor.ct.tsx`.

## Consequences

A device attached when a terminal drops closes its turn slot live. A device that attaches later still heals through `chatOpened`. A dropped event has no replay row, so a device that misses the live frame relies on the attach heal, as live-only events do. The automation watcher reads the live firehose, so a fanned dropped `turnCompleted` fires its `turnCompleted` rules; the turn did complete, so that is correct. The log keeps no gap a reader could detect, because the next append takes the dropped row's `seq`.

## Alternatives rejected

Fan only the turn terminals: canon announcements from verbs outside a turn would still leave other devices stale. Return a typed verdict to the engine: canon has committed, so the engine has no correct action, and every caller would ignore the verdict. An outbox that re-appends later: a late `seq` lands after the next turn's rows and breaks replay order, and a crash loses the queue. Close the slot on the client when its own send settles: it helps only the sending device and breaks the rule that only the bus writes the turn slot. Keep a numeric cursor on the frame and widen the client's type exemption: the guard would then re-admit from-zero re-replays of terminals, the defect it exists to stop.
