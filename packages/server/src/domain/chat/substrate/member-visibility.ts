// substrate/member-visibility — the SERVER MEMBER-STRIP (parity-plus §3.6): hidden-class content NEVER
// reaches a NON-HOST member's payload. This is a TRUST BOUNDARY, not a render nicety — the client render
// filter (contracts `contentSpansToBlocks`) also drops hidden spans, but a client-only hide leaks the truth
// bytes in the network payload to anyone who opens devtools; for a deception/omniscience mechanic in a
// shared room the strip must happen where the payload is PRODUCED, server-side, per-viewer.
//
// The D106 precedent class (member-plane clamp): like the join-history floor, the verdict is per-CALLER,
// applied at every projection that hands canon content to a viewer — `listMessages`, the durable bus replay
// (`replayChatEvents`), and the LIVE SSE fan-out (the transport applies `stripChatEventForMember` off the
// `viewerIsHost` flag `chatEventBounds` resolves at the same member-gated probe as the D16 floor).
//
// WHO SEES WHAT (§3.6, owner ruling #7): the MODEL always (the wire projection rides hidden spans verbatim —
// it never touches this module); the HOST reads their own payload UNSTRIPPED (the reveal eye + the standing
// inventory are P3 reads over it); MEMBERS never (stripped here). The strip removes ONLY `hidden`-class
// spans (`HIDDEN_TAGS` registrants); `unknown-directive` noise is display-filtered client-side but is NOT a
// secret and stays in the payload.
//
// THE STRIP IS TOTAL OVER FENCE BODIES. `stripHiddenSpans` runs a fence-blind hidden-scan pass rather than
// tokenizing with the render grammar — grammar-aware tokenizing treats a CLOSED `:::card` fence as one span
// carrying its whole body as `raw`, which would re-emit a `<lie …/>` the model wrote inside a card body
// verbatim into the member's committed payload (invisible on their screen, since a card body renders as
// HTML, but present in their DOM). The ``` code-fence exclusion is the one named, ratified hole (the reader
// SEES that tag — a visible model bug, not a silent leak).
//
// THE MID-STREAM CHANNEL (§3.6 — closed by the PRODUCER-SIDE stamper): the live token DELTA stream + the
// durable event replay carry raw model text char-by-char, so a member watching a turn stream would see
// hidden bytes as they generate (they vanish at commit — a devtools-only leak). The `text`-channel delta is
// run through a STATEFUL per-slot scrubber (`@orb/kit/content::createHiddenSpanStreamScrubber`) that emits only
// the prefix provably free of a hidden tag (open or in-progress) and drops any hidden tag once it closes.
// FAIL-CLOSED: an in-progress open is withheld; a truncated/aborted open is dropped; the member's authoritative
// final content is the at-commit-stripped `messageCommitted` view (this module's `stripHiddenForMember`), so
// dropping a held tail costs nothing — the stream is a best-effort preview, the committed view is the truth.
//
// THE SCRUB STATE IS THE PRODUCER'S, NOT THE SUBSCRIBER'S (the mid-slot reconnect leak). That scrubber is
// stateful over a slot's WHOLE stream, and it is viewer-independent — every non-host member is owed the same
// bytes. A per-SUBSCRIPTION scrubber (one map in the SSE generator, another thrown away inside each durable
// replay) cold-starts mid-tag for any reader that begins — or resumes — while a `<lie …/>` open is still in
// flight: `1234"/> The vault is empty.` contains no `<`, so a fresh scrubber calls all of it safe and forwards
// the secret's tail — and it is an ORACLE, not just a race: the withheld open makes the member's ghost
// visibly stall, telling them exactly when to reconnect. The one home is on the WRITE side —
// `createMemberDeltaStamper`, owned by `domain/chat/bus::createChatBus`, stamps every delta's member bytes onto
// `ChatBusEvent.memberText` before the durable append, warm from the slot's first byte. Every read seam
// (`scrubDeltaEventForMember`, the durable `scrubChatEventReplayForMember`, the transport's live fan-out, a
// future multiplexed room source) is now a STATELESS field read that has no state to be missing.
//
// THE P3 REASONING-CHANNEL RULE (§3.6 — the game-conditional add): the BODY strip
// above is UNCONDITIONAL (a `<lie>`'s truth is always stripped from a member's payload). The REASONING/thinking
// channel is different: it is member-visible by default (the P2 body strip left it alone by design), but a
// deceptive model can spill a lie's truth in its reasoning ("I'll tell them X but secretly Y"). So when a game
// is DECEPTION-ACTIVE (`config.features.deception || omniscience`, resolved server-side via the injected
// `ChatRpgOps.resolveReasoningHostOnly`) AND the viewer is NOT the host, the WHOLE reasoning channel goes
// host-only — the member sees NO reasoning for that game (not a per-tag scrub; the whole-channel cut is the
// clean threat boundary). This module exposes the reasoning strip as a SEPARATE, composable layer
// (`stripReasoningFromView` + the `reasoningHostOnly`-gated wrappers): the call site resolves the per-chat
// deception-active flag once and applies it beside the body strip. Games WITHOUT deception keep reasoning
// member-visible exactly as today (no regression). It covers EVERY reasoning-carrying member-reachable surface:
// the committed/edited `MessageView.reasoning` (commit + list + durable replay + the view-carrying bus events
// incl. `reasoningEdited`/`reasoningCleared`), the live `reasoning`-channel token DELTA, `reasoningStreamDone`,
// and the fork copy (a non-host forker of a deception game must not launder a member→host reasoning leak).

import type { ChatBusEvent, ChatDeltaEvent, MessageView } from "@orb/contracts/chat";
import type { HiddenSpanStreamScrubber } from "@orb/kit/content";
import { createHiddenSpanStreamScrubber, stripHiddenSpans } from "@orb/kit/content";
import type { ChatId } from "@orb/kit/ids";
import type { ChatBusReplayEvent, ChatStreamReplayEvent } from "../contract/views.ts";

/** Strip hidden-class spans from one message view's content. Identity when nothing is hidden (the common
 *  case allocates nothing). Only `content` carries body prose; the `reasoning` channel is handled SEPARATELY
 *  by the P3 game-conditional reasoning strip ({@link stripReasoningFromView}) — a body strip never touches
 *  reasoning, so a non-deception game's reasoning is unaffected.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function stripHiddenForMember(view: MessageView): MessageView {
  const { content, hadHidden } = stripHiddenSpans(view.content);
  return hadHidden ? { ...view, content } : view;
}

/** P3 (§3.6): withhold the whole REASONING channel from a member of a deception-active game. Nulls
 *  `view.reasoning` (identity when it is already null — the common non-reasoning row allocates nothing). The
 *  BODY is left to {@link stripHiddenForMember}; a caller applies BOTH when the game is deception-active.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function stripReasoningFromView(view: MessageView): MessageView {
  return view.reasoning === null ? view : { ...view, reasoning: null };
}

/** The FULL member projection of one view (§3.6): the unconditional hidden-span BODY strip, plus — when the
 *  game is DECEPTION-ACTIVE — the whole reasoning channel withheld. `reasoningHostOnly` is the per-chat verdict
 *  the caller resolved once (`resolveReasoningHostOnly && viewer !== host`); `false` keeps reasoning exactly as
 *  today (no regression for a non-deception game). The ONE composed member-view projection every commit / list /
 *  replay / bus surface routes through, so the two strips never drift apart. */
export function projectViewForMember(view: MessageView, reasoningHostOnly: boolean): MessageView {
  const bodyStripped = stripHiddenForMember(view);
  return reasoningHostOnly ? stripReasoningFromView(bodyStripped) : bodyStripped;
}

/** A caller's chat role — the §3.6 verdict axis (host reads unstripped; anyone else is a member). Matches the
 *  `ParticipantRole` shape the guards resolve, narrowed to the one bit this boundary needs. */
interface ViewerRole {
  readonly role: string;
}

/** Does this viewer hold the HOST role? THE ONE spelling of `role === "host"` for the whole role-PROJECTION
 *  class — every derived host verdict in this module, every `ChatDetail`-style payload flag, and every
 *  role-conditioned POLICY VALUE (`auth/clamp.ts` — the D106 history floor, the D22 card level) composes it
 *  rather than re-deriving the comparison inline.
 *
 *  Takes `ViewerRole | undefined` because "the viewer is not on the roster" is a real arm at the projection
 *  seam (`toChatDetail` resolves its viewer with a `participants.find`): a non-member is not a host, and
 *  saying so HERE keeps the `?.role === "host"` idiom from being re-spelled at each producer.
 *
 *  THE BOUNDARY: this is the DATA-PROJECTION class (D106-F1 — consumers thread the verdict
 *  as DATA), which is why it takes a bare `ViewerRole` and not a `Principal` + `can()`. Its counterpart is the
 *  ENFORCEMENT class, homed at `substrate/auth/decide.ts::permitsHost` / `assertHost`: any comparison that
 *  DECIDES whether an operation is permitted goes there, under spine invariant #6. The THIRD host-role shape
 *  is in neither class and has its own home — the roster LOOKUP (`substrate/participants-host.ts::hostUserIdOf`,
 *  role → identity, D19): it asks "which seat is the host?", not "does this viewer hold host?". Three shapes,
 *  three homes, zero inline re-spellings. Deliberately NOT wired
 *  through `can()` — doing so would thread a Principal into this pure, I/O-free module for zero behavior
 *  change (`can(…, 'host', …)` reduces to exactly this comparison; the Principal is never read). */
export function viewerHoldsHost(viewer: ViewerRole | undefined): boolean {
  return viewer?.role === "host";
}

/** Is THIS caller entitled to the unstripped hidden-content payload (§3.6 "the host via the eye")? The host
 *  reads verbatim; every other present role is a member and is stripped. The ONE place the host/member split
 *  is spelled for the payload boundary — every verb/return that hands canon content to a caller routes its
 *  verdict through here (never re-derives `role === "host"` inline). A NAMED LENS over
 *  {@link viewerHoldsHost}, not a second comparison: the payload boundary says WHY the host bit is being
 *  asked for, and the bit itself has one home. */
export function viewerReadsHidden(viewer: ViewerRole): boolean {
  return viewerHoldsHost(viewer);
}

/** Strip the hidden-class spans from EVERY `MessageView` a mutation return hands back to a NON-HOST caller
 *  (§3.6), plus — when the game is DECEPTION-ACTIVE — the reasoning channel. The turn verbs (`send`/`swipe`/
 *  `continueTurn`/`impersonate`/`generate`) resolve a `TurnOutcome` whose `messages` carry the freshly-committed
 *  assistant reply — a member who ran the turn would otherwise receive the model's `<lie>` truth (or, on a
 *  deception game, the reasoning that spells it out) in the HTTP return payload (a devtools-only leak, exactly
 *  the class the bus/list strips close). The host reads the outcome verbatim (the reveal-eye plane).
 *  `reasoningHostOnly` is the caller-resolved per-chat verdict (default `false` ⇒ body-only, the pre-P3
 *  behavior). Identity for a host or an all-clean, non-deception outcome (no per-row churn). */
export function stripMessagesForViewer<T extends { readonly messages: readonly MessageView[] }>(outcome: T, viewer: ViewerRole, reasoningHostOnly = false): T {
  if (viewerReadsHidden(viewer) || outcome.messages.length === 0) {
    return outcome;
  }
  return { ...outcome, messages: outcome.messages.map((v) => projectViewForMember(v, reasoningHostOnly)) };
}

/**
 * The §3.6 member RETURN projection for a mutation that hands back ONE `MessageView` — the single-view twin of
 * {@link stripMessagesForViewer}. THE ONE SEAM every mutation return site routes through (`turn.ts`'s undo/
 * revert, every `edit.ts` verb), so the host/member split for a mutation return has exactly one spelling and
 * the two verb files can never drift.
 *
 * HOST IS IDENTITY: the same object is returned and `resolveReasoningHostOnly` is never called — a host return
 * is byte-identical and costs no extra read. A non-host viewer gets the unconditional body hidden-strip PLUS,
 * on a deception-active game, the whole reasoning channel withheld.
 *
 * The verdict resolver is INJECTED rather than read off a `ChatContext`, so this module stays pure and I/O-free
 * (it may not import the domain context — the caller owns the rpg op, per D106-F1: consumers thread the verdict
 * as DATA, they never re-derive it).
 */
export async function projectViewReturnForViewer(
  view: MessageView,
  viewer: ViewerRole,
  resolveReasoningHostOnly: (chatId: ChatId) => Promise<boolean>,
): Promise<MessageView> {
  if (viewerReadsHidden(viewer)) {
    return view;
  }
  return projectViewForMember(view, await resolveReasoningHostOnly(view.chatId));
}

/** The view-carrying `ChatBusEvent` members — the strip's coverage set, listed explicitly so the boundary
 *  is auditable. THE ONE-LINE RULE for a future bus author: any ChatBusEvent member that carries a
 *  view (MessageView) field MUST be listed here, or its canon body reaches a member unstripped. The rule is made
 *  COMPILE-TIME below (`ViewCarryingType` derives the exhaustive set from the union; the `satisfies` fails
 *  `tsc` if a new view-carrying member is added without registering it here) — not merely "caught by the
 *  payload pins." */
const VIEW_EVENT_TYPES = ["messageCommitted", "messageEdited", "messageHidden", "variantSelected", "reasoningEdited", "reasoningCleared"] as const;

/** Every union member that structurally carries a `view` — derived from `ChatBusEvent`, so a new
 *  view-carrying member automatically joins this set and forces `VIEW_EVENT_TYPES` to grow (the pin below). */
type ViewCarryingType = Extract<ChatBusEvent, { view?: MessageView }>["type"];
type ListedViewType = (typeof VIEW_EVENT_TYPES)[number];
// COMPILE-TIME COVERAGE PIN (D50/D106 ratchet), BOTH directions: `VIEW_EVENT_TYPES` must list EXACTLY the
// view-carrying types. `AssertEqual` is `never` unless the two sets are mutually assignable — a NEW
// view-carrying bus member (missing from the list) OR a listed non-view type makes it RED until fixed, so the
// strip can never silently miss a canon-body carrier.
type AssertExtends<A, B> = [A] extends [B] ? true : never;
const _VIEW_EVENT_COVERAGE: [AssertExtends<ViewCarryingType, ListedViewType>, AssertExtends<ListedViewType, ViewCarryingType>] = [true, true];
void _VIEW_EVENT_COVERAGE;
type ViewCarryingEvent = Extract<ChatBusEvent, { type: (typeof VIEW_EVENT_TYPES)[number] }>;

function isViewCarrying(event: ChatBusEvent): event is ViewCarryingEvent {
  return (VIEW_EVENT_TYPES as readonly string[]).includes(event.type);
}

/** Strip a bus event's canon payload for a non-host subscriber (§3.6). A VIEW-carrying event has its `view`
 *  body-stripped (+ reasoning-stripped when `reasoningHostOnly`); a `reasoningStreamDone` event is DROPPED
 *  entirely (returns `null`) on a deception game — it is a member-visible signal that a (now-withheld) reasoning
 *  channel finished, so it must not reach a member of a deception game. All other events (lifecycle, warnings)
 *  pass through. DELTAs are handled separately by the mid-stream scrubber (`scrubDeltaEventForMember`); this is
 *  the AT-COMMIT / durable-view arm. `reasoningHostOnly` is the caller-resolved per-chat verdict (default `false`
 *  ⇒ body-only, the pre-P3 behavior). A `null` return means WITHHOLD (the durable replay / live fan-out skips it). */
export function stripChatEventForMember(event: ChatBusEvent, reasoningHostOnly = false): ChatBusEvent | null {
  if (reasoningHostOnly && event.type === "reasoningStreamDone") {
    return null;
  }
  if (!isViewCarrying(event)) {
    return event;
  }
  return event.view === undefined ? event : { ...event, view: projectViewForMember(event.view, reasoningHostOnly) };
}

/**
 * The mid-stream verdict for one `delta` bus event toward a NON-HOST subscriber (§3.6) — STATELESS, and
 * deliberately so (see the file header): it reads the member bytes the PRODUCER already stamped onto
 * `memberText`, so it is identical whether this delta arrives live, out of the durable replay, or on a
 * subscription that attached halfway through the slot.
 *
 * A `text`-channel delta returns an event carrying exactly the stamped bytes (`null` = nothing to emit → the
 * caller SKIPS the yield, so the member never sees an empty delta). FAIL-CLOSED on an UNSTAMPED delta
 * (`memberText === undefined` — a producer that bypassed `domain/chat/bus`): the member gets nothing rather
 * than the raw model text. `memberText === null` means "stamped, byte-identical to `delta.text`" — the common
 * no-hidden-span tick, which costs no second copy of the token in the durable log.
 *
 * A `reasoning`-channel delta: on a DECEPTION-active game (`reasoningHostOnly`) it is DROPPED (`null` — the
 * whole reasoning channel is host-only, so the live reasoning stream never reaches a member); otherwise it
 * passes through unchanged (a non-deception game keeps reasoning member-visible, and the hidden BODY grammar
 * rides the text channel, not reasoning). The re-emitted delta drops `memberText`: a member's wire carries the
 * member bytes ONCE, in `delta.text`, exactly as it did before the stamp existed.
 */
export function scrubDeltaEventForMember(event: Extract<ChatBusEvent, { type: "delta" }>, reasoningHostOnly = false): ChatBusEvent | null {
  if (event.delta.kind !== "text") {
    // A reasoning-channel delta: withheld entirely on a deception game (host-only reasoning); passed on otherwise.
    return reasoningHostOnly ? null : event;
  }
  if (event.memberText === undefined) {
    return null;
  }
  const safe = event.memberText ?? event.delta.text;
  if (safe.length === 0) {
    return null;
  }
  const delta: ChatDeltaEvent = { chatId: event.delta.chatId, kind: "text", text: safe };
  return { type: event.type, chatId: event.chatId, slotSeq: event.slotSeq, delta };
}

/** The PRODUCER-side mid-stream scrub state (§3.6 — the file header's "the scrub state is the producer's").
 *  One stateful scrubber per streaming slot, fed every `text` delta IN EMIT ORDER and retired when the slot's
 *  turn ends, so the state is warm from the slot's first byte and no reader ever has to reconstruct it. */
interface MemberDeltaStamper {
  /** Stamp `memberText` onto a `delta` event (identity for every other member) — call ONCE per emitted event,
   *  in emit order, BEFORE the durable append: the stored payload and the live fan must carry the same bytes. */
  readonly stamp: (event: ChatBusEvent) => ChatBusEvent;
}

/** One streaming slot's scrub-state key — the chat plus the `messages.seq` the tokens are streaming INTO
 *  (the same anchor the D16 clamp reads off the delta event). */
function slotKey(chatId: ChatId, slotSeq: number): string {
  return `${chatId}:${slotSeq}`;
}

/** The stamped `memberText` for ONE text delta, advancing that slot's scrubber. `null` = byte-identical to
 *  `delta.text` (the common tick — the durable row then keeps ONE copy of the token). */
function stampTextDelta(scrubbers: Map<string, HiddenSpanStreamScrubber>, chatId: ChatId, slotSeq: number, text: string): string | null {
  const key = slotKey(chatId, slotSeq);
  const existing = scrubbers.get(key);
  const scrubber = existing ?? createHiddenSpanStreamScrubber();
  if (existing === undefined) {
    scrubbers.set(key, scrubber);
  }
  const safe = scrubber.push(text);
  return safe === text ? null : safe;
}

/** The slot's streaming phase is over: drop its state. A committed/edited row retires its own slot precisely
 *  (`view.seq`); a turn that ends WITHOUT committing one (abort/failure) would otherwise leave its scrubber
 *  behind forever, so a turn-terminal event sweeps the whole chat — turns are sequential per chat, so no live
 *  slot's state is ever swept out from under it. */
function retireSlotState(scrubbers: Map<string, HiddenSpanStreamScrubber>, event: ChatBusEvent): void {
  // `in` narrows the optional `view?: MessageView` to present-and-defined — the same shape the transport's
  // retired `retireScrubberOnCommit` read.
  if ("view" in event) {
    scrubbers.delete(slotKey(event.chatId, event.view.seq));
    return;
  }
  if (event.type !== "turnCompleted" && event.type !== "turnAborted" && event.type !== "chatDeleted") {
    return;
  }
  for (const key of scrubbers.keys()) {
    if (key.startsWith(`${event.chatId}:`)) {
      scrubbers.delete(key);
    }
  }
}

/** Build the per-process producer stamper. ONE instance, owned by `domain/chat/bus::createChatBus`. */
export function createMemberDeltaStamper(): MemberDeltaStamper {
  const scrubbers = new Map<string, HiddenSpanStreamScrubber>();
  return {
    stamp(event: ChatBusEvent): ChatBusEvent {
      if (event.type !== "delta") {
        retireSlotState(scrubbers, event);
        return event;
      }
      // The reasoning channel carries no hidden-span grammar; its member verdict is the deception gate
      // (`reasoningHostOnly`), applied per-viewer at the read seam. Stamp `null` so it is never mistaken for
      // an UNSTAMPED event (which is withheld).
      const memberText = event.delta.kind === "text" ? stampTextDelta(scrubbers, event.chatId, event.slotSeq, event.delta.text) : null;
      return { ...event, memberText };
    },
  };
}

/** Scrub the DURABLE SSE token-log replay (`replayStreamEvents`) for a NON-HOST caller (§3.6). A late
 *  subscriber / reconnect replays the raw per-slot token stream; without this a member would receive the
 *  model's hidden bytes in the replayed `text` deltas. Each slot (`messageId`) gets a FRESH scrubber (the rows
 *  are the whole, already-committed stream for that slot), fed in order; a row whose scrubbed text is empty is
 *  DROPPED (it carried only held/hidden bytes). The final held tail is dropped — the caller's authoritative
 *  content is the at-commit-stripped `listMessages`/`replayChatEvents` view, not the token log. Reasoning
 *  rows and a `null` messageId (an unanchored control row) pass through. Identity for a host (verbatim). */
export function scrubStreamReplayForMember(rows: readonly ChatStreamReplayEvent[], viewer: ViewerRole, reasoningHostOnly = false): ChatStreamReplayEvent[] {
  if (viewerReadsHidden(viewer)) {
    return [...rows];
  }
  const scrubbers = new Map<string, HiddenSpanStreamScrubber>();
  const out: ChatStreamReplayEvent[] = [];
  for (const row of rows) {
    // P3 (§3.6): a REASONING replay row is a member-visible thinking-channel byte; DROP it on a deception game
    // (host-only reasoning), else pass it through.
    if (row.kind === "reasoning") {
      if (!reasoningHostOnly) {
        out.push(row);
      }
      continue;
    }
    // A `text` row with no slot anchor (an unanchored control row) passes through — it carries no scrubable body.
    if (row.messageId === null) {
      out.push(row);
      continue;
    }
    let scrubber = scrubbers.get(row.messageId);
    if (scrubber === undefined) {
      scrubber = createHiddenSpanStreamScrubber();
      scrubbers.set(row.messageId, scrubber);
    }
    const safe = scrubber.push(row.delta);
    if (safe.length > 0) {
      out.push({ ...row, delta: safe });
    }
  }
  return out;
}

/** The member projection of the DURABLE chat-bus-log replay (`replayChatEvents`), §3.6. Unlike the per-event
 *  {@link stripChatEventForMember} (which is deliberately delta-blind), the durable replay also carries raw
 *  `delta` rows (a resume from `lastEventId:"0"` re-drains the whole mid-turn token stream), so it MUST apply
 *  the same delta verdict the live path does — otherwise a member's reconnect leaks the model's hidden `<lie>`
 *  TEXT bytes AND (on a deception game) the whole reasoning channel the live stream withheld. This is the
 *  durable twin of `resolveLiveYield` and, since the scrub state is the PRODUCER's (file header), it is now
 *  literally the same stateless call: a `text` delta forwards its stamped `memberText` (empty/unstamped →
 *  dropped); a `reasoning` delta is dropped on a deception game; a `reasoningStreamDone` is dropped on a
 *  deception game; every view-carrying event is body+reasoning projected; all else passes. Host: identity.
 *  Row ORDER no longer matters to correctness — a cursor landing mid-`<lie …/>` replays exactly the bytes the
 *  live stream would have sent. A dropped row is omitted (its `seq` gap is correct — the cursor is the last
 *  DELIVERED seq, exactly as the D16 floor drop). */
export function scrubChatEventReplayForMember(rows: readonly ChatBusReplayEvent[], viewer: ViewerRole, reasoningHostOnly = false): ChatBusReplayEvent[] {
  if (viewerReadsHidden(viewer)) {
    return [...rows];
  }
  const out: ChatBusReplayEvent[] = [];
  for (const { seq, event } of rows) {
    if (event.type === "delta") {
      const scrubbed = scrubDeltaEventForMember(event, reasoningHostOnly);
      if (scrubbed !== null) {
        out.push({ seq, event: scrubbed });
      }
      continue;
    }
    const projected = stripChatEventForMember(event, reasoningHostOnly);
    if (projected !== null) {
      out.push({ seq, event: projected });
    }
  }
  return out;
}
