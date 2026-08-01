// domain/chat/bus — the chat bus emitter + the in-process replay ring. A feature-root collaborator: the
// verbs/engine close over `emit`; the transport SSE fan-out reads the ring + the durable `chat_events` log.
//
// DURABLE-FIRST: `emit` awaits the `chat_events` INSERT before pushing to the in-process ring — so a late
// subscriber always ramps up from the durable log even if the process dies between the write and the push.
//
// THE §3.6 MEMBER STAMP: `emit` is also where a `delta`'s member-visible bytes are computed
// (`substrate/member-visibility::createMemberDeltaStamper` → `ChatBusEvent.memberText`). It belongs HERE, not
// at a read seam, because the hidden-span scrub is stateful across a slot's whole delta stream: a subscriber
// that attaches or reconnects mid-`<lie …/>` has no way to reconstruct that state and used to forward the
// secret's tail verbatim. One stamper per process, warm from each slot's first token, applied BEFORE the
// durable append so the stored row and the live fan carry identical bytes — which is why `emit` returns the
// STAMPED event, not just its seq: the composition root must fan exactly what was logged.
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
import { createMemberDeltaStamper } from "./substrate/member-visibility";

/** What was durably logged: the assigned per-chat `seq` (the replay cursor) plus the event AS STORED — the
 *  §3.6-stamped copy, so the composition root fans the exact bytes the log holds. */
interface ChatEmitted {
  readonly seq: number;
  readonly event: ChatBusEvent;
}

/** Returns what was logged so the composition root can fan the same cursor-stamped event onto the transport
 *  live bus — or `null` when the append was dropped (see FLAG[emit-is-total]). */
type EmitChatEvent = (event: ChatBusEvent) => Promise<ChatEmitted | null>;

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
  // The §3.6 producer stamper (see the file header) — ONE per bus, so a slot's scrub state spans its whole
  // token stream regardless of who is (or is not) subscribed at any moment.
  const stamper = createMemberDeltaStamper();

  const emit: EmitChatEvent = async (raw) => {
    const chatId = raw.chatId;
    // Stamped BEFORE the durable write and used for every downstream copy: the log row, the ring, and the
    // composition root's live fan must all carry the identical member projection.
    const event = stamper.stamp(raw);
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
    return { seq, event };
  };

  const readRing = (chatId: ChatId, afterSeq?: number): ChatRingEntry[] => {
    const ring = rings.get(chatId) ?? [];
    return afterSeq === undefined ? [...ring] : ring.filter((e) => e.seq > afterSeq);
  };

  return { emit, readRing };
}
