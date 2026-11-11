// domain/chat/bus — the chat bus emitter. A feature-root collaborator: the verbs/engine close over `emit`; the
// transport SSE fan-out replays from the durable `chat_events` log.
//
// DURABLE-FIRST: `emit` awaits the `chat_events` INSERT before it hands the event to the live fan — so a late
// subscriber always ramps up from the durable log even if the process dies between the write and the fan.
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
//     ERROR and return the dropped event. A lost event on a live chat is a permanent replay gap, so the
//     transient half of that class (write contention) is recovered by the retry instead of merely logged.
// `emitAfterClaim` IS FIRE-ONCE BY DESIGN, AND THAT IS A RULING, NOT A GAP. `emit` retries because
// its append stands ALONE: a lost append is a permanent replay gap with no other record of the thing it
// announced. The claim door's append rides the SAME SQLite batch as the state change it announces, and that
// atomicity answers both halves of "a claim-carrying event lost to a transient fault is terminal for replay":
//   • the batch did NOT commit ⇒ the claim was not consumed and the state change did not happen. There is
//     nothing to replay, and re-announcing would be a lie. The CALLER's own retry re-does both planes.
//   • the batch COMMITTED and the driver died reporting it ⇒ both planes stand, so the event has a
//     `chat_events` row and its cursor: a reconnect replays it exactly once. Only the LIVE FAN is lost —
//     the same recoverable half the terminal-drop branches below name for `emit`.
// A retry is also structurally incapable of double-consuming (the co-statement's `changes() > 0` guard makes
// a re-run of an already-consumed claim a converged no-op that answers `false`) — so the missing retry costs
// a LIVE FAN in one branch and nothing at all in the other. WHAT WOULD REOPEN THIS: a caller whose claim does NOT ride this batch, or a caller that
// must tell `false` (converged) apart from `null` (dropped) — today no caller reads either.
//
// THE TERMINAL DROP HAS TWO BRANCHES, and they state opposite facts (`reportTerminalDrop`): with
// one id per retry, "the first attempt COMMITTED and the same-id retry tripped the PK" is reachable, and
// there the row (with its replay slot) STANDS. `committedRowSeq` PROVES the seq of that standing row, so
// `emit` PUBLISHES it on the live fan with the SAME `publishCommitted` the normal path uses — the fan is
// never skipped for want of a proven seq; nothing is lost on this branch, only a message that must not
// claim otherwise. Both
// branches are still ERROR — a driver that lies about a commit is a genuine fault worth flagging even when
// fully recovered — but the message must not claim a permanent replay gap (or a lost fan) for the branch
// that has neither. Which branch it is comes off GROUND TRUTH (the stored payload under our id), never a
// driver error code, for the same reason `classifyFailedAppend` states.
// A DROPPED append on a live chat returns `{ seq: null, event }`, never a rejection: canon committed apart from
// the log, so the caller has nothing to undo, and D342 rules what the live fan does with it — the event still fans
// without a cursor (`fansWhenDropped`, `substrate/publication.ts`) so neither an attached device nor an automation
// rule waits on a row that will never exist; the table there names the few types that do not, and why. `null`
// means only "the chat is gone": nothing fans, because the room's own `chatDeleted` announces it. Aborting the turn at delete
// (verbs/chat-lifecycle) stops the emits at the SOURCE; this classification is the floor under every other cause.

import type { ChatBusEvent, DurableChatBusEvent } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import type { DbAssemblyInput, StatementToken } from "@orb/db/wiring";
import { databaseForOwner, statementForOwner, statementToken } from "@orb/db/wiring-owner";
import type { ChatEventId, ChatId, ChatTurnId } from "@orb/kit/ids";
import type { Logger } from "#foundation/observability";
import { getLog } from "#foundation/observability";
import type { ChatContext, ChatServiceDeps } from "./contract/context.ts";
import { appendChatEvent, appendChatEventAfterClaimStatement, insertChatEventStatement } from "./persistence/events.ts";
import { loadChatEventById, loadChatRow } from "./persistence/queries.ts";
import { createMemberDeltaStamper } from "./substrate/member-visibility.ts";

/** What was durably logged: the assigned per-chat `seq` (the replay cursor) plus the event AS STORED — the
 *  §3.6-stamped copy, so the composition root fans the exact bytes the log holds. */
interface ChatEmitted {
  readonly seq: number;
  readonly event: DurableChatBusEvent;
}

/** A live-chat append that exhausted its retry: the stamped event, with no cursor (D342). */
interface ChatDropped {
  readonly seq: null;
  readonly event: DurableChatBusEvent;
}

/** Returns what was logged so the composition root can fan the same cursor-stamped event onto the transport
 *  live bus, the dropped event when a live-chat append failed for good, or `null` when the chat is gone (see
 *  FLAG[emit-is-total]).
 *
 *  `DurableChatBusEvent`, not the whole union: the live-only lane (`LIVE_ONLY_CHAT_EVENT_TYPES`, contracts
 *  §3.4) has no `chat_events` form, so handing one to this emit is a COMPILE error rather than a row the db
 *  CHECK would reject at runtime. Its fan surface is `entry/compose/services::emitChatEventLive`. */
type EmitChatEvent = (event: DurableChatBusEvent, continuedBody?: string) => Promise<ChatEmitted | ChatDropped | null>;

/** `false` means another caller already consumed the claim: converged success, with nothing to publish. */
type EmitChatEventAfterClaim = (event: DurableChatBusEvent, claimStatement: StatementToken) => Promise<ChatEmitted | false | null>;

interface ChatBus {
  readonly emit: EmitChatEvent;
  /** Claim state first, then append only if that exact statement changed a row, in one SQLite batch. */
  readonly emitAfterClaim: EmitChatEventAfterClaim;
  /** Where each turn still open in `chatId` entered the log, by `seq`. */
  readonly openTurns: ChatServiceDeps["openTurns"];
  /** Prepare the first event for a room-creation batch, then publish the already-committed row without a
   * second append. `chatCreated` is the only event whose sequence is known before its room exists. */
  readonly prepareCreation: (event: Extract<DurableChatBusEvent, { readonly type: "chatCreated" }>) => {
    readonly statement: StatementToken;
    readonly publishCommitted: () => ChatEmitted;
  };
}

type ChatBusDeps = Pick<ChatContext, "db" | "now" | "newEventId" | "logger">;

/** Classify a failed append (FLAG[emit-is-total]). The verdict is read off GROUND TRUTH — does the `chats` row
 *  still exist — never off the driver's error code: an FK violation is only ever a symptom, and a probe that
 *  itself fails means the db is unwell, which is exactly the unexpected arm. Never throws.
 *
 *  RETURNS THE VERDICT, does not just log it: "the chat was deleted mid-turn" is a BENIGN race with
 *  nothing to recover, while "the append failed on a live chat" is a permanent replay gap — a missing turn
 *  terminal, a missed automation trigger, a stranded client — and the two must not share a fate.
 *
 *  It reports ONLY the benign arm. The live-fault arm's report belongs to the CALLER, because what that
 *  failure MEANS differs by door: `emit` can retry (so the first look is a warn and only the last is an
 *  error), while `emitAfterClaim` carries a single-consumption claim statement and is terminal on sight. */
async function classifyFailedAppend(db: Db, event: ChatBusEvent, logger: Logger): Promise<"chat-gone" | "live-fault"> {
  const chatId = event.chatId;
  let chatGone = false;
  // a failed probe leaves `chatGone` false, so the verdict is `live-fault`,
  // which both callers log with the original append error: `handleAppendFailure` (warn on retry, `reportTerminalDrop`
  // error on the last attempt) and `emitAfterClaim` (error). Ends if a caller stops logging `live-fault`.
  try {
    chatGone = (await loadChatRow(db, chatId)) === undefined;
  } catch {
    // The probe failed ⇒ we cannot claim the benign race; fall through to the loud arm.
  }
  if (chatGone) {
    getLog(logger).debug({ chatId, type: event.type }, "chat bus: event dropped — the chat was deleted mid-turn (expected race)");
    return "chat-gone";
  }
  return "live-fault";
}

/** What to do next after a failed append attempt: give up immediately (the chat is gone), retry (attempts
 *  remain), or the retry is exhausted — `committedSeq` is the terminal branch's provable seq (`null` when
 *  genuinely nothing landed), so `emit` can publish it on the live fan without re-deciding the branch itself
 *  (kept as a helper so `emit`'s own control flow stays under the cognitive-complexity ceiling). */
type AppendFailureVerdict = { readonly kind: "chat-gone" } | { readonly kind: "retry" } | { readonly kind: "terminal"; readonly committedSeq: number | null };

async function handleAppendFailure(
  db: Db,
  failure: { readonly id: ChatEventId; readonly event: ChatBusEvent; readonly err: unknown; readonly attempt: number },
  logger: Logger,
): Promise<AppendFailureVerdict> {
  const { id, event, err, attempt } = failure;
  // A deleted chat is terminal on the first look (a cascade-dropped row does not come back), so only the
  // live-chat arm is worth another attempt — and only while attempts remain.
  if ((await classifyFailedAppend(db, event, logger)) === "chat-gone") {
    return { kind: "chat-gone" };
  }
  if (attempt < LIVE_APPEND_ATTEMPTS) {
    getLog(logger).warn({ err, chatId: event.chatId, type: event.type, attempt }, "chat bus: durable append failed on a live chat — retrying");
    return { kind: "retry" };
  }
  return { kind: "terminal", committedSeq: await reportTerminalDrop(db, { id, event, err, attempts: attempt }, logger) };
}

/** The outcome of the whole retry loop, collapsed to what `emit` needs to decide its return: `"gone"` means the
 *  chat is gone and nothing fans; `"dropped"` means no row and no cursor, and the publication decides its fan
 *  (D342); `"seq"` is the ordinary first-attempt success; `"recovered"` is a terminal-drop branch
 *  that PROVED its seq, carrying the SAME `seq` shape `"seq"` does so the caller needs no third branch. */
type AppendOutcome =
  | { readonly kind: "gone" }
  | { readonly kind: "dropped" }
  | { readonly kind: "seq"; readonly seq: number }
  | { readonly kind: "recovered"; readonly seq: number };

/** Run the durable append with its live-chat retry (kept out of `emit` itself so its own control flow stays
 *  under the cognitive-complexity ceiling). ONE id for the whole retry, minted by the caller:
 *  a fresh id per attempt made the retry UNCONDITIONALLY SAFE-LOOKING and was the opposite — see the header's
 *  FLAG discussion and `handleAppendFailure`'s doc for why re-using the id is what makes the DB the arbiter. */
async function appendWithRetry(deps: ChatBusDeps, id: ChatEventId, event: ChatBusEvent): Promise<AppendOutcome> {
  for (let attempt = 1; attempt <= LIVE_APPEND_ATTEMPTS; attempt += 1) {
    // `err` goes to `handleAppendFailure`, which logs it on every live-chat
    // arm: `getLog(logger).warn` while attempts remain, `getLog(logger).error` through `reportTerminalDrop` on the last. The
    // `chat-gone` arm drops a benign delete-mid-turn race at debug. Ends if `handleAppendFailure` stops logging `err`.
    try {
      const seq = await appendChatEvent(deps.db, { id, chatId: event.chatId, event, createdAt: deps.now() });
      return { kind: "seq", seq };
    } catch (err) {
      const verdict = await handleAppendFailure(deps.db, { id, event, err, attempt }, deps.logger);
      if (verdict.kind === "chat-gone") {
        return { kind: "gone" };
      }
      if (verdict.kind === "terminal") {
        return verdict.committedSeq === null ? { kind: "dropped" } : { kind: "recovered", seq: verdict.committedSeq };
      }
    }
  }
  return { kind: "dropped" };
}

/** How many times a live-chat append is attempted before the event is declared lost. TWO: the realistic
 *  live-chat failure is a transient write contention (`busy_timeout` exhausted under a concurrent workload
 *  batch), and one immediate replay is what converts that from a permanent replay gap into a hiccup. More
 *  attempts would sit on the hot turn path for a db that is genuinely down, which the loud drop below is
 *  the honest answer to. */
const LIVE_APPEND_ATTEMPTS = 2;

/** The cursor of the row our append minted under `id` — undefined when this event never landed.
 *
 *  IDENTITY, not existence: the retry re-uses ONE event id, so a row under that id can be either OUR
 *  committed append or a row some other emit already owns (a duplicate-id minter is exactly what the fixed-id
 *  fault pin exercises). Only the STORED PAYLOAD answers "did this event commit", so the verdict compares it
 *  against what we tried to write — the same GROUND-TRUTH rule `classifyFailedAppend` states, never a driver
 *  error code. Never throws: a probe that fails leaves the loud arm, which is the honest answer when the db
 *  is too unwell to say. */
async function committedRowSeq(db: Db, id: ChatEventId, event: ChatBusEvent): Promise<number | null> {
  // a failed probe returns `null`, "cannot prove it landed", and the
  // only caller `reportTerminalDrop` then logs the original append error at error level with the dropped-event
  // message. Ends if another caller reads `null` without logging.
  try {
    const row = await loadChatEventById(db, id);
    return row !== undefined && JSON.stringify(row.payload) === JSON.stringify(event) ? row.seq : null;
  } catch {
    return null;
  }
}

/** The one attempt-exhausted append the report below classifies: the id the whole retry re-used, the stamped
 *  event it tried to write, the last attempt's error, and how many attempts were spent.
 */
interface TerminalDrop {
  readonly id: ChatEventId;
  readonly event: ChatBusEvent;
  readonly err: unknown;
  readonly attempts: number;
}

/** Report the terminal drop BY BRANCH and RETURN the branch's provable seq so the caller can
 *  publish it on the live fan — `null` means genuinely nothing to publish (the replay-gap branch). Both
 *  branches are still ERROR — a driver that lies about a commit is a genuine fault worth flagging even when
 *  fully recovered — but they state opposite facts, and one id per retry makes the second branch reachable: when
 *  the first attempt COMMITTED and the same-id retry tripped the PK, the row and its replay slot STAND.
 *  Since `committedRowSeq` PROVES that row's seq, the live fan is not lost either — the caller
 *  publishes it with the same emission the normal path makes, so "its replay slot is permanently missing"
 *  (and "only the live fan was lost") are both exactly backwards on this branch. */
async function reportTerminalDrop(db: Db, drop: TerminalDrop, logger: Logger): Promise<number | null> {
  const { id, event, err, attempts } = drop;
  const fields = { err, chatId: event.chatId, type: event.type, attempts };
  const committedSeq = await committedRowSeq(db, id, event);
  if (committedSeq === null) {
    getLog(logger).error(fields, "chat bus: DURABLE APPEND FAILED on a live chat — event dropped, its replay slot is permanently missing");
    return null;
  }
  getLog(logger).error(
    { ...fields, seq: committedSeq },
    "chat bus: DURABLE APPEND reported failure AFTER committing on a live chat — recovered from ground truth: the row, its replay slot, and the live fan all stand",
  );
  return committedSeq;
}

/** Build the per-process chat bus (ONE instance, wired at the composition root). */
export function createChatBus(input: DbAssemblyInput<ChatBusDeps>): ChatBus {
  const deps: ChatBusDeps = { ...input, db: databaseForOwner(input.db) };
  // The §3.6 producer stamper (see the file header) — ONE per bus, so a slot's scrub state spans its whole
  // token stream regardless of who is (or is not) subscribed at any moment.
  const stamper = createMemberDeltaStamper();
  const open = new Map<ChatId, Map<ChatTurnId, number>>();
  const noOpenTurns: ReadonlyMap<ChatTurnId, number> = new Map<ChatTurnId, number>();

  // A terminal closes its turn even when its append was lost: the turn has ended either way, and a turn left open
  // here would have its ghost replayed to every joiner with nothing to close it.
  const closeTurn = (event: DurableChatBusEvent): void => {
    if (event.type !== "turnCompleted" && event.type !== "turnAborted") {
      return;
    }
    const turns = open.get(event.chatId);
    turns?.delete(event.turnId);
    if (turns?.size === 0) {
      open.delete(event.chatId);
    }
  };

  const trackTurn = (seq: number, event: DurableChatBusEvent): void => {
    if (event.type === "turnAccepted" || event.type === "turnStarted") {
      const turns = open.getOrInsertComputed(event.chatId, () => new Map<ChatTurnId, number>());
      turns.set(event.turnId, turns.get(event.turnId) ?? seq);
    }
    closeTurn(event);
  };

  const publishCommitted = (seq: number, event: DurableChatBusEvent): ChatEmitted => {
    trackTurn(seq, event);
    return { seq, event };
  };

  const prepareCreation: ChatBus["prepareCreation"] = (raw) => {
    const event = stamper.stamp(raw);
    return {
      statement: statementToken(
        insertChatEventStatement(deps.db, {
          id: deps.newEventId(),
          chatId: event.chatId,
          seq: 1,
          event,
          createdAt: deps.now(),
        }),
      ),
      publishCommitted: (): ChatEmitted => publishCommitted(1, event),
    };
  };

  const emit: EmitChatEvent = async (raw, continuedBody) => {
    // Stamped BEFORE the durable write and used for every downstream copy: the log row and the
    // composition root's live fan must both carry the identical member projection.
    const event = stamper.stamp(raw, continuedBody);
    // Durable-first: commit the INSERT before the live fan so a crash can never leave a
    // delivered-but-unlogged event.
    // FLAG[emit-is-total]: a failed durable write is classified, RETRIED on a live chat, and finally dropped —
    // never rethrown, because the engine's delta emits are fire-and-forget and a rejection here kills the
    // process. A drop returns the event without a cursor and the publication decides its live fan (D342);
    // `null` means the chat is gone and nothing fans. The retry itself lives in
    // `appendWithRetry` — kept out of `emit` so its own control flow stays under the cognitive-complexity
    // ceiling — and it mints ONE id for the whole retry outside its loop (see its own header
    // comment for why re-using the id is what makes the DB the arbiter of a duplicate-vs-lost commit).
    const outcome = await appendWithRetry(deps, deps.newEventId(), event);
    if (outcome.kind === "gone") {
      open.delete(event.chatId);
      return null;
    }
    if (outcome.kind === "dropped") {
      closeTurn(event);
      return { seq: null, event };
    }
    // `"recovered"` is the terminal-drop branch that PROVED its seq — publish it on the live fan with
    // the SAME emission `"seq"` (the ordinary success arm) makes, rather than skipping the fan on the retired
    // "cannot prove what seq landed" premise.
    return publishCommitted(outcome.seq, event);
  };

  const emitAfterClaim: EmitChatEventAfterClaim = async (raw, claimStatement) => {
    const chatId = raw.chatId;
    const event = stamper.stamp(raw);
    // the catch below logs `err` with `getLog(deps.logger).error` whenever
    // `classifyFailedAppend` says `live-fault`; the other verdict is the benign delete-mid-turn race, logged at debug
    // there. Not retried: the batch carries a single-consumption claim. Ends if the `live-fault` log is dropped.
    try {
      const append = appendChatEventAfterClaimStatement(deps.db, {
        id: deps.newEventId(),
        chatId,
        event,
        createdAt: deps.now(),
      });
      const [, rows] = await deps.db.batch([statementForOwner(claimStatement), append]);
      const seq = rows.at(0)?.seq;
      if (seq === undefined) {
        return false;
      }
      return publishCommitted(seq, event);
    } catch (err) {
      // Terminal on sight, and the header's `emitAfterClaim` ruling is why that is correct rather
      // than merely careful: this append rides the CALLER's claim in one batch, so a failure means the thing
      // being announced did not happen (nothing to replay) — or it did, durably, and only the live fan was
      // lost (a reconnect replays it). Neither case is a retry's to fix.
      if ((await classifyFailedAppend(deps.db, event, deps.logger)) === "live-fault") {
        getLog(deps.logger).error({ err, chatId, type: event.type }, "chat bus: DURABLE APPEND FAILED on a live chat — claimed event dropped");
      }
      return null;
    }
  };

  return { emit, emitAfterClaim, prepareCreation, openTurns: (chatId) => open.get(chatId) ?? noOpenTurns };
}
