// domain/chat/bus — the chat bus emitter + the in-process replay ring. A feature-root collaborator: the
// verbs/engine close over `emit`; the transport SSE fan-out reads the ring + the durable `chat_events` log.
//
// DURABLE-FIRST: `emit` awaits the `chat_events` INSERT before pushing to the in-process ring — so a late
// subscriber always ramps up from the durable log even if the process dies between the write and the push.
//
// FLAG[bus-not-on-ctx]: the chat bus is chat's own in-process collaborator, not a cross-feature injected op,
// so it is deliberately NOT on `ChatContext`. service.ts builds ONE bus via `createChatBus(ctx)` and hands
// `bus.emit` to the verb factories that emit.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import type { ChatContext } from "./contract/context";
import { appendChatEvent } from "./persistence/events";

/** Returns the durable per-chat `seq` so the composition root can fan the same cursor-stamped event onto the
 *  transport live bus. */
type EmitChatEvent = (event: ChatBusEvent) => Promise<number>;

interface ChatRingEntry {
  readonly seq: number;
  readonly event: ChatBusEvent;
}

interface ChatBus {
  readonly emit: EmitChatEvent;
  /** Entries strictly after `afterSeq` (absent ⇒ the whole retained window), oldest-first. */
  readonly readRing: (chatId: ChatId, afterSeq?: number) => ChatRingEntry[];
}

type ChatBusDeps = Pick<ChatContext, "db" | "now" | "newEventId">;

/** How many recent events the in-process ring retains per chat; a deeper resume falls back to `chat_events`. */
const RING_CAPACITY = 256;

/** Build the per-process chat bus (ONE instance, wired at the composition root). */
export function createChatBus(deps: ChatBusDeps): ChatBus {
  const rings = new Map<ChatId, ChatRingEntry[]>();

  const emit: EmitChatEvent = async (event) => {
    const chatId = event.chatId;
    // Durable-first: commit the INSERT before the in-memory push so a crash can never leave a
    // delivered-but-unlogged event.
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
