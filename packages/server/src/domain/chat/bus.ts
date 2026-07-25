// domain/chat/bus — the chat bus emitter + the in-process replay ring. A feature-root collaborator: the
// verbs/engine close over `emit`; the transport SSE fan-out reads the ring + the durable `chat_events` log.
//
// DURABLE-FIRST: `emit` awaits the `chat_events` INSERT before pushing to the in-process ring — so a late
// subscriber always ramps up from the durable log even if the process dies between the write and the push.
//
// FLAG[bus-not-on-ctx]: the chat bus is chat's own in-process collaborator, not a cross-feature injected op,
// so it is deliberately NOT on `ChatContext`. service.ts builds ONE bus via `createChatBus(ctx)` and hands
// `bus.emit` to the verb factories that emit.
//
// FLAG[emit-is-total]: `emit` NEVER rejects. The engine's stream emits are fire-and-forget (`void deps.emit(…)`
// on every token delta), so a rejecting durable write is an unhandled rejection — i.e. a process kill for every
// user. It happened: deleting a chat mid-turn cascade-drops the `chats` row, the next `delta` INSERT trips the
// `chat_events.chat_id` FK, and the process exited. A failed append is therefore CLASSIFIED, never thrown:
//   • the chat row is gone  → the expected delete-mid-turn race: drop at debug, return `null`.
//   • anything else         → a real fault: LOG AT ERROR (observable), drop, return `null`.
// `null` ⇒ the event was not durably logged, so the composition root must not fan it either (a fanned event
// with no `chat_events` row would be un-replayable). Aborting the turn at delete (verbs/chat-lifecycle) stops
// the emits at the SOURCE; this classification is the floor under every other cause.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { ChatContext } from "./context";
import { appendChatEvent } from "./persistence/events";
import { loadChatRow } from "./persistence/queries";

/** Returns the durable per-chat `seq` so the composition root can fan the same cursor-stamped event onto the
 *  transport live bus — or `null` when the append was dropped (see FLAG[emit-is-total]). */
type EmitChatEvent = (event: ChatBusEvent) => Promise<number | null>;

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

/** Classify + report a dropped append (FLAG[emit-is-total]). The verdict is read off GROUND TRUTH — does the
 *  `chats` row still exist — never off the driver's error code: an FK violation is only ever a symptom, and a
 *  probe that itself fails means the db is unwell, which is exactly the unexpected arm. Never throws. */
async function reportDroppedAppend(db: Db, event: ChatBusEvent, err: unknown): Promise<void> {
  const chatId = event.chatId;
  let chatGone = false;
  try {
    chatGone = (await loadChatRow(db, chatId)) === undefined;
  } catch {
    // The probe failed ⇒ we cannot claim the benign race; fall through to the loud arm.
  }
  if (chatGone) {
    getLog().debug({ chatId, type: event.type }, "chat bus: event dropped — the chat was deleted mid-turn (expected race)");
    return;
  }
  getLog().error({ err, chatId, type: event.type }, "chat bus: DURABLE APPEND FAILED on a live chat — event dropped");
}

/** Build the per-process chat bus (ONE instance, wired at the composition root). */
export function createChatBus(deps: ChatBusDeps): ChatBus {
  const rings = new Map<ChatId, ChatRingEntry[]>();

  const emit: EmitChatEvent = async (event) => {
    const chatId = event.chatId;
    // Durable-first: commit the INSERT before the in-memory push so a crash can never leave a
    // delivered-but-unlogged event.
    let seq: number;
    try {
      seq = await appendChatEvent(deps.db, {
        id: deps.newEventId(),
        chatId,
        event,
        createdAt: deps.now(),
      });
    } catch (err) {
      // FLAG[emit-is-total]: a failed durable write is classified + reported, never rethrown — the engine's
      // delta emits are fire-and-forget, so a rejection here kills the process.
      await reportDroppedAppend(deps.db, event, err);
      return null;
    }

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
