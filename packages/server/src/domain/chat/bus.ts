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
//   • anything else         → a real fault on a LIVE chat: warn, RETRY the append once, and only then drop at
//     ERROR (#1454). Totality is the mechanism and it stands; what changed is that "the append failed" stopped
//     being one undifferentiated `null`. A lost event on a live chat is a permanent replay gap — a missing turn
//     terminal, a missed automation trigger, a stranded client — so the transient half of that class (write
//     contention) is now recovered instead of merely logged.
// THE TERMINAL DROP HAS TWO BRANCHES, and they state opposite facts (#1544 — `reportTerminalDrop`): #1537's
// one-id-per-retry made "the first attempt COMMITTED and the same-id retry tripped the PK" reachable, and
// there the row (with its replay slot) STANDS while only the live fan is lost. Both are ERROR — a stranded
// live subscriber is not a warning — but the message must not claim a permanent replay gap for the branch
// that has none. Which branch it is comes off GROUND TRUTH (the stored payload under our id), never a driver
// error code, for the same reason `classifyFailedAppend` states.
// `null` ⇒ the event was not durably logged, so the composition root must not fan it either (a fanned event
// with no `chat_events` row would be un-replayable). Aborting the turn at delete (verbs/chat-lifecycle) stops
// the emits at the SOURCE; this classification is the floor under every other cause.
//
// STILL OPEN (#1454, reported as a fork rather than decided here): `ChatServiceDeps.emit` is typed
// `Promise<void>` and `entry/compose/services::emitChatEvent` awaits the checked variant and DISCARDS its
// boolean, so an ordinary send/turn caller cannot see a post-retry loss. Propagating it collides with
// FLAG[emit-is-total] above (three domain service contracts cite the `void emit()` unhandled-rejection kill as
// the reason this seam is total), and widening the return with no reader would be ceremony — the owner picks
// between "typed verdict every caller may ignore" and "an outbox".

import type { ChatBusEvent, DurableChatBusEvent } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { ChatEventId, ChatId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { ChatContext } from "./context.ts";
import { appendChatEvent, appendChatEventAfterClaimStatement, insertChatEventStatement } from "./persistence/events.ts";
import { loadChatEventById, loadChatRow } from "./persistence/queries.ts";
import { createMemberDeltaStamper } from "./substrate/member-visibility.ts";

/** What was durably logged: the assigned per-chat `seq` (the replay cursor) plus the event AS STORED — the
 *  §3.6-stamped copy, so the composition root fans the exact bytes the log holds. */
interface ChatEmitted {
  readonly seq: number;
  readonly event: ChatBusEvent;
}

/** Returns what was logged so the composition root can fan the same cursor-stamped event onto the transport
 *  live bus — or `null` when the append was dropped (see FLAG[emit-is-total]).
 *
 *  `DurableChatBusEvent`, not the whole union: the live-only lane (`LIVE_ONLY_CHAT_EVENT_TYPES`, contracts
 *  §3.4) has no `chat_events` form, so handing one to this emit is a COMPILE error rather than a row the db
 *  CHECK would reject at runtime. Its fan surface is `entry/compose/services::emitChatEventLive`. */
type EmitChatEvent = (event: DurableChatBusEvent) => Promise<ChatEmitted | null>;

/** `false` means another caller already consumed the claim: converged success, with nothing to publish. */
type EmitChatEventAfterClaim = (event: DurableChatBusEvent, claimStatement: BatchStmt) => Promise<ChatEmitted | false | null>;

interface ChatRingEntry {
  readonly seq: number;
  readonly event: ChatBusEvent;
}

interface ChatBus {
  readonly emit: EmitChatEvent;
  /** Claim state first, then append only if that exact statement changed a row, in one SQLite batch. */
  readonly emitAfterClaim: EmitChatEventAfterClaim;
  /** Prepare the first event for a room-creation batch, then publish the already-committed row without a
   * second append. `chatCreated` is the only event whose sequence is known before its room exists. */
  readonly prepareCreation: (event: Extract<DurableChatBusEvent, { readonly type: "chatCreated" }>) => {
    readonly statement: BatchStmt;
    readonly publishCommitted: () => ChatEmitted;
  };
  /** Entries strictly after `afterSeq` (absent ⇒ the whole retained window), oldest-first. */
  readonly readRing: (chatId: ChatId, afterSeq?: number) => ChatRingEntry[];
}

type ChatBusDeps = Pick<ChatContext, "db" | "now" | "newEventId">;

/** How many recent events the in-process ring retains per chat; a deeper resume falls back to `chat_events`. */
const RING_CAPACITY = 256;

/** Classify a failed append (FLAG[emit-is-total]). The verdict is read off GROUND TRUTH — does the `chats` row
 *  still exist — never off the driver's error code: an FK violation is only ever a symptom, and a probe that
 *  itself fails means the db is unwell, which is exactly the unexpected arm. Never throws.
 *
 *  RETURNS THE VERDICT, does not just log it (#1454): "the chat was deleted mid-turn" is a BENIGN race with
 *  nothing to recover, while "the append failed on a live chat" is a permanent replay gap — a missing turn
 *  terminal, a missed automation trigger, a stranded client — and the two must not share a fate.
 *
 *  It reports ONLY the benign arm. The live-fault arm's report belongs to the CALLER, because what that
 *  failure MEANS differs by door: `emit` can retry (so the first look is a warn and only the last is an
 *  error), while `emitAfterClaim` carries a single-consumption claim statement and is terminal on sight. */
async function classifyFailedAppend(db: Db, event: ChatBusEvent): Promise<"chat-gone" | "live-fault"> {
  const chatId = event.chatId;
  let chatGone = false;
  // @orb-gate-ignore caught-failure-ownership(empty:catch): the ground-truth probe failing means the db is
  // unwell — fall through to the `live-fault` verdict, which the CALLER reports with the original `err`. Ends
  // if the probe grows its own retry/backoff (then it owns classifying its own failure).
  try {
    chatGone = (await loadChatRow(db, chatId)) === undefined;
  } catch {
    // The probe failed ⇒ we cannot claim the benign race; fall through to the loud arm.
  }
  if (chatGone) {
    getLog().debug({ chatId, type: event.type }, "chat bus: event dropped — the chat was deleted mid-turn (expected race)");
    return "chat-gone";
  }
  return "live-fault";
}

/** How many times a live-chat append is attempted before the event is declared lost. TWO: the realistic
 *  live-chat failure is a transient write contention (`busy_timeout` exhausted under a concurrent workload
 *  batch), and one immediate replay is what converts that from a permanent replay gap into a hiccup. More
 *  attempts would sit on the hot turn path for a db that is genuinely down, which the loud drop below is
 *  the honest answer to. */
const LIVE_APPEND_ATTEMPTS = 2;

/** The cursor of the row our append minted under `id` — undefined when this event never landed.
 *
 *  IDENTITY, not existence (#1544): the retry re-uses ONE event id, so a row under that id can be either OUR
 *  committed append or a row some other emit already owns (a duplicate-id minter is exactly what the fixed-id
 *  fault pin exercises). Only the STORED PAYLOAD answers "did this event commit", so the verdict compares it
 *  against what we tried to write — the same GROUND-TRUTH rule `classifyFailedAppend` states, never a driver
 *  error code. Never throws: a probe that fails leaves the loud arm, which is the honest answer when the db
 *  is too unwell to say. */
async function committedRowSeq(db: Db, id: ChatEventId, event: ChatBusEvent): Promise<number | null> {
  // @orb-gate-ignore caught-failure-ownership(empty:catch): the probe failing means the db is unwell — fall
  // through to "we cannot prove it landed", which is the LOUD arm the caller already reports with the
  // original `err`. Ends if this probe grows its own retry (then it owns reporting its own failure).
  try {
    const row = await loadChatEventById(db, id);
    return row !== undefined && JSON.stringify(row.payload) === JSON.stringify(event) ? row.seq : null;
  } catch {
    return null;
  }
}

/** The one attempt-exhausted append the report below classifies: the id the whole retry re-used, the stamped
 *  event it tried to write, the last attempt's error, and how many attempts were spent. */
interface TerminalDrop {
  readonly id: ChatEventId;
  readonly event: DurableChatBusEvent;
  readonly err: unknown;
  readonly attempts: number;
}

/** Report the terminal drop BY BRANCH (#1544). Both are ERROR — a stranded live subscriber is not a warning —
 *  but they state opposite facts, and #1537 made the second branch reachable: when the first attempt COMMITTED
 *  and the same-id retry tripped the PK, the row and its replay slot STAND and only the live fan was lost, so
 *  "its replay slot is permanently missing" was exactly backwards. The surviving `seq` rides the log line
 *  because it is what a reconnect will deliver. */
async function reportTerminalDrop(db: Db, drop: TerminalDrop): Promise<void> {
  const { id, event, err, attempts } = drop;
  const fields = { err, chatId: event.chatId, type: event.type, attempts };
  const committedSeq = await committedRowSeq(db, id, event);
  if (committedSeq === null) {
    getLog().error(fields, "chat bus: DURABLE APPEND FAILED on a live chat — event dropped, its replay slot is permanently missing");
    return;
  }
  getLog().error(
    { ...fields, seq: committedSeq },
    "chat bus: DURABLE APPEND reported failure AFTER committing on a live chat — only the LIVE FAN was lost; the row and its replay slot stand (a reconnect delivers it exactly once)",
  );
}

/** Build the per-process chat bus (ONE instance, wired at the composition root). */
export function createChatBus(deps: ChatBusDeps): ChatBus {
  const rings = new Map<ChatId, ChatRingEntry[]>();
  // The §3.6 producer stamper (see the file header) — ONE per bus, so a slot's scrub state spans its whole
  // token stream regardless of who is (or is not) subscribed at any moment.
  const stamper = createMemberDeltaStamper();

  const publishCommitted = (seq: number, event: ChatBusEvent): ChatEmitted => {
    const ring = rings.get(event.chatId) ?? [];
    ring.push({ seq, event });
    if (ring.length > RING_CAPACITY) {
      ring.splice(0, ring.length - RING_CAPACITY);
    }
    rings.set(event.chatId, ring);
    return { seq, event };
  };

  const prepareCreation: ChatBus["prepareCreation"] = (raw) => {
    const event = stamper.stamp(raw);
    return {
      statement: insertChatEventStatement(deps.db, {
        id: deps.newEventId(),
        chatId: event.chatId,
        seq: 1,
        event,
        createdAt: deps.now(),
      }),
      publishCommitted: (): ChatEmitted => publishCommitted(1, event),
    };
  };

  const emit: EmitChatEvent = async (raw) => {
    const chatId = raw.chatId;
    // Stamped BEFORE the durable write and used for every downstream copy: the log row, the ring, and the
    // composition root's live fan must all carry the identical member projection.
    const event = stamper.stamp(raw);
    // Durable-first: commit the INSERT before the in-memory push so a crash can never leave a
    // delivered-but-unlogged event.
    // FLAG[emit-is-total]: a failed durable write is classified, RETRIED on a live chat, and finally dropped —
    // never rethrown, because the engine's delta emits are fire-and-forget and a rejection here kills the
    // process. `null` still means "not durably logged, do not fan".
    let seq: number | undefined;
    // ONE id for the whole retry, minted OUTSIDE the loop (#1537). A fresh id per attempt made the retry
    // UNCONDITIONALLY SAFE-LOOKING and was the opposite: an append that COMMITS and then reports failure (a
    // driver/transport fault after the row landed) would be written a SECOND time under a new id and a new
    // seq, with no constraint left to catch it — a duplicated durable event, which durable-first replay then
    // delivers twice. Re-using the id makes the DB the arbiter: if the first attempt really committed, the
    // retry trips the `chat_events` PK and is classified as a live fault, so the event is dropped from the
    // LIVE fan while its row (and therefore its replay slot) stands — a reconnect delivers it exactly once.
    // Losing a live fan is the recoverable half; a duplicate row is not.
    const id = deps.newEventId();
    for (let attempt = 1; attempt <= LIVE_APPEND_ATTEMPTS; attempt += 1) {
      // @orb-gate-ignore caught-failure-ownership(default:err): classified by classifyFailedAppend (ground-truth
      // probe + log) per FLAG[emit-is-total] above — never rethrown, and the final attempt's failure is reported
      // loudly below. Ends if a caller needs the durable-write failure to propagate.
      try {
        seq = await appendChatEvent(deps.db, { id, chatId, event, createdAt: deps.now() });
        break;
      } catch (err) {
        // A deleted chat is terminal on the first look (a cascade-dropped row does not come back), so only the
        // live-chat arm is worth another attempt — and only while attempts remain.
        if ((await classifyFailedAppend(deps.db, event)) === "chat-gone") {
          return null;
        }
        if (attempt < LIVE_APPEND_ATTEMPTS) {
          getLog().warn({ err, chatId, type: event.type, attempt }, "chat bus: durable append failed on a live chat — retrying");
        } else {
          await reportTerminalDrop(deps.db, { id, event, err, attempts: attempt });
          return null;
        }
      }
    }
    if (seq === undefined) {
      return null;
    }

    return publishCommitted(seq, event);
  };

  const emitAfterClaim: EmitChatEventAfterClaim = async (raw, claimStatement) => {
    const chatId = raw.chatId;
    const event = stamper.stamp(raw);
    // @orb-gate-ignore caught-failure-ownership(default:err): same FLAG[emit-is-total] contract as `emit`
    // above — classifyFailedAppend classifies + reports, never rethrown. Ends if a caller needs the durable
    // write failure to propagate. NOT retried, unlike `emit`: the batch carries the caller's CLAIM statement,
    // which is single-consumption by construction — a replay could apply it twice.
    try {
      const append = appendChatEventAfterClaimStatement(deps.db, {
        id: deps.newEventId(),
        chatId,
        event,
        createdAt: deps.now(),
      });
      const results = await deps.db.batch(batchMany([claimStatement, append]));
      const rows = results[1] as { seq: number }[];
      const seq = rows.at(0)?.seq;
      if (seq === undefined) {
        return false;
      }
      return publishCommitted(seq, event);
    } catch (err) {
      // Terminal on sight — the claim statement is single-consumption, so a replay could apply it twice.
      if ((await classifyFailedAppend(deps.db, event)) === "live-fault") {
        getLog().error({ err, chatId, type: event.type }, "chat bus: DURABLE APPEND FAILED on a live chat — claimed event dropped");
      }
      return null;
    }
  };

  const readRing = (chatId: ChatId, afterSeq?: number): ChatRingEntry[] => {
    const ring = rings.get(chatId) ?? [];
    return afterSeq === undefined ? [...ring] : ring.filter((e) => e.seq > afterSeq);
  };

  return { emit, emitAfterClaim, prepareCreation, readRing };
}
