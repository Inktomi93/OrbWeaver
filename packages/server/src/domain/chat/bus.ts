// domain/chat/bus — the chat bus emitter + the in-process replay ring (chat.md Part I 8-slot `bus.ts`;
// §"the chat bus": durable + replay ring; Part III §12 inv #10/#11). A FEATURE-ROOT collaborator (the
// `guard.ts` precedent — a root file may reach `persistence/` + write via `ctx.db`, exempt from the
// substrate-below-verbs rule): the verbs/engine close over `emit`; the transport SSE fan-out (PD-23) reads
// the ring + the durable `chat_events` log later.
//
// DURABLE-FIRST (chat.md §"the chat bus" — "await-before-deliver durability"; inv #10): `emit` AWAITS the
// `chat_events` INSERT (the producer's path, the replay source of truth) BEFORE pushing to the in-process
// ring — so a late subscriber always ramps up from the durable log even if the process dies between the
// write and the in-memory push. The per-chat `seq` is assigned by a same-statement correlated subquery
// (`coalesce(max(seq),0)+1`), monotonic under SQLite's serialized writes (the project's single-replica
// assumption — chat.md §active-turns/auto-mode "ASSUMES single-replica").
//
// BUS PAYLOAD ALLOWLIST (inv #11): the event is a `ChatBusEvent` — a closed union of branded ids / enum
// literals / `MessageView`, with no `unknown`/`Record` field a secret could ride in (type-enforced by the
// contract; the `chat_events.type` CHECK mirrors the discriminant set). This emitter adds no payload.
//
// FLAG[bus-not-on-ctx]: the chat bus is chat's OWN in-process collaborator, NOT a cross-feature injected op,
// so it is deliberately NOT on `ChatContext`. `service.ts` (the composition root) builds ONE bus via
// `createChatBus(ctx)` and hands `bus.emit` to the verb factories that emit (the second factory arg). The
// emit type is inlined on the verb factories (`(event: ChatBusEvent) => Promise<void>`) because the
// `types-in-contract` gate forbids an exported type here and `contract/` is owned by another chunk.
// The durable `chat_events` INSERT lives in `persistence/events.ts` (`appendChatEvent` — PD-88); the
// readers (`replayChatEvents`/`chatEventBounds`) stay in `persistence/queries.ts`.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import type { ChatContext } from "./contract/context";
import { appendChatEvent } from "./persistence/events";

/** The bus emit op the verbs/engine close over — durable-first (the `chat_events` row commits before the
 *  in-process ring push). Returns the durable per-chat `seq` so the composition root can fan the SAME
 *  cursor-stamped event onto the transport live bus (the `streamMessages` SSE half — the verbs' inlined
 *  `Promise<void>` emit shape stays assignable). NON-exported (the `types-in-contract` gate). */
type EmitChatEvent = (event: ChatBusEvent) => Promise<number>;

/** One replay-ring entry — the per-chat replay cursor + the room-public event (the late-subscriber ramp-up
 *  the transport reads before it tails live). */
interface ChatRingEntry {
  readonly seq: number;
  readonly event: ChatBusEvent;
}

/** The chat bus surface: the durable-first emit + the in-process replay-ring read. The SSE fan-out
 *  (subscribe + tail) is transport's (PD-23); this provides the emit + the ring read it ramps from. */
interface ChatBus {
  readonly emit: EmitChatEvent;
  /** The retained in-process ring for a chat — entries strictly after `afterSeq` (absent ⇒ the whole
   *  retained window), oldest-first. The DURABLE source of truth is `chat_events` (replayChatEvents); this
   *  is the hot in-memory tail the transport reads to avoid a db round-trip for recent events. */
  readonly readRing: (chatId: ChatId, afterSeq?: number) => ChatRingEntry[];
}

/** The deps `createChatBus` closes over — the db handle (the durable write), the clock + the event-id minter
 *  (determinism). A `Pick` of `ChatContext` so the root passes the same bundle the verbs use. */
type ChatBusDeps = Pick<ChatContext, "db" | "now" | "newEventId">;

/** How many recent events the in-process ring retains per chat (the late-subscriber ramp-up window; a deeper
 *  resume falls back to the durable `chat_events` log). */
const RING_CAPACITY = 256;

/**
 * Build the per-process chat bus (ONE instance, wired at the composition root). `emit` writes the durable
 * `chat_events` row FIRST (await — the replay source of truth), THEN pushes to the in-process ring; a reader
 * that resumes deeper than the ring window falls back to `replayChatEvents`. The ring is a bounded per-chat
 * buffer (the newest {@link RING_CAPACITY} events).
 */
export function createChatBus(deps: ChatBusDeps): ChatBus {
  const rings = new Map<ChatId, ChatRingEntry[]>();

  const emit: EmitChatEvent = async (event) => {
    const chatId = event.chatId;
    // Durable-first: the INSERT (persistence/events.ts — the correlated per-chat seq) must commit before
    // the in-memory push so a crash can never leave a delivered-but-unlogged event.
    const seq = await appendChatEvent(deps.db, {
      id: deps.newEventId(),
      chatId,
      event,
      createdAt: deps.now(),
    });

    const ring = rings.get(chatId) ?? [];
    ring.push({ seq, event });
    if (ring.length > RING_CAPACITY) {
      ring.splice(0, ring.length - RING_CAPACITY);
    }
    rings.set(chatId, ring);
    return seq;
  };

  const readRing = (chatId: ChatId, afterSeq?: number): ChatRingEntry[] => {
    const ring = rings.get(chatId) ?? [];
    return afterSeq === undefined ? [...ring] : ring.filter((e) => e.seq > afterSeq);
  };

  return { emit, readRing };
}
