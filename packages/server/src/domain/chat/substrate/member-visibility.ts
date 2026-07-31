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
// THE MID-STREAM CHANNEL (§3.6 — closed by the per-subscriber scrubber): the live token DELTA stream + the
// durable stream-event replay carry raw model text char-by-char, so a member watching a turn stream would see
// hidden bytes as they generate (they vanish at commit — a devtools-only leak). The `text`-channel delta is
// run through a STATEFUL per-slot scrubber (`@orb/kit/content::createHiddenSpanStreamScrubber`) that emits only
// the prefix provably free of a hidden tag (open or in-progress) and drops any hidden tag once it closes.
// FAIL-CLOSED: an in-progress open is withheld; a truncated/aborted open is dropped; the member's authoritative
// final content is the at-commit-stripped `messageCommitted` view (this module's `stripHiddenForMember`), so
// dropping a held tail costs nothing — the stream is a best-effort preview, the committed view is the truth.
//
// THE P3 REASONING-CHANNEL RULE (§3.6, owner-ratified 2026-07-27 — the game-conditional add): the BODY strip
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
import type { ChatBusReplayEvent, ChatStreamReplayEvent } from "../contract/views";

/** Strip hidden-class spans from one message view's content. Identity when nothing is hidden (the common
 *  case allocates nothing). Only `content` carries body prose; the `reasoning` channel is handled SEPARATELY
 *  by the P3 game-conditional reasoning strip ({@link stripReasoningFromView}) — a body strip never touches
 *  reasoning, so a non-deception game's reasoning is unaffected. */
export function stripHiddenForMember(view: MessageView): MessageView {
  const { content, hadHidden } = stripHiddenSpans(view.content);
  return hadHidden ? { ...view, content } : view;
}

/** P3 (§3.6): withhold the whole REASONING channel from a member of a deception-active game. Nulls
 *  `view.reasoning` (identity when it is already null — the common non-reasoning row allocates nothing). The
 *  BODY is left to {@link stripHiddenForMember}; a caller applies BOTH when the game is deception-active. */
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

/** Is THIS caller entitled to the unstripped hidden-content payload (§3.6 "the host via the eye")? The host
 *  reads verbatim; every other present role is a member and is stripped. The ONE place the host/member split
 *  is spelled for the payload boundary — every verb/return that hands canon content to a caller routes its
 *  verdict through here (never re-derives `role === "host"` inline). */
export function viewerReadsHidden(viewer: ViewerRole): boolean {
  return viewer.role === "host";
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

/** The mid-stream scrubber verdict for one `delta` bus event toward a NON-HOST subscriber (§3.6). The
 *  `text`-channel delta is fed to the caller-owned per-slot scrubber; the returned event carries only the
 *  bytes provably safe this tick (a `null` return = nothing safe emitted → the transport SKIPS the yield, so
 *  the member never sees an empty delta). A `reasoning`-channel delta: on a DECEPTION-active game
 *  (`reasoningHostOnly`) it is DROPPED (`null` — the whole reasoning channel is host-only, so the live
 *  reasoning stream never reaches a member); otherwise it passes through unchanged (a non-deception game keeps
 *  reasoning member-visible, and the hidden BODY grammar rides the text channel, not reasoning). A non-delta
 *  event is a programming error at this seam and returns unchanged. The SCRUBBER is stateful and per-slot — the
 *  transport owns one per `slotSeq` for the subscriber's lifetime and NEVER shares it with a host (a host reads
 *  verbatim). */
export function scrubDeltaEventForMember(
  event: Extract<ChatBusEvent, { type: "delta" }>,
  scrubber: HiddenSpanStreamScrubber,
  reasoningHostOnly = false,
): ChatBusEvent | null {
  if (event.delta.kind !== "text") {
    // A reasoning-channel delta: withheld entirely on a deception game (host-only reasoning); passed on otherwise.
    return reasoningHostOnly ? null : event;
  }
  const safe = scrubber.push(event.delta.text);
  if (safe.length === 0) {
    return null;
  }
  const delta: ChatDeltaEvent = { chatId: event.delta.chatId, kind: "text", text: safe };
  return { ...event, delta };
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

/** The STATEFUL member projection of the DURABLE chat-bus-log replay (`replayChatEvents`), §3.6. Unlike the
 *  per-event {@link stripChatEventForMember} (which is deliberately delta-blind — the LIVE transport scrubs
 *  deltas via {@link scrubDeltaEventForMember}), the durable replay also carries raw `delta` rows (a resume
 *  from `lastEventId:"0"` re-drains the whole mid-turn token stream), so it MUST apply the same per-slot delta
 *  scrub the live path does — otherwise a member's reconnect leaks the model's hidden `<lie>` TEXT bytes AND
 *  (on a deception game) the whole reasoning channel that the live stream withheld. This is the durable twin
 *  of `resolveLiveYield`: a `text` delta rides a per-`slotSeq` stateful scrubber (empty→dropped); a `reasoning`
 *  delta is dropped on a deception game; a `reasoningStreamDone` is dropped on a deception game; every
 *  view-carrying event is body+reasoning projected; all else passes. Host: identity. Rows arrive in append
 *  order (the scrubber state depends on it). A dropped row is omitted (its `seq` gap is correct — the cursor
 *  is the last DELIVERED seq, exactly as the D16 floor drop). */
export function scrubChatEventReplayForMember(rows: readonly ChatBusReplayEvent[], viewer: ViewerRole, reasoningHostOnly = false): ChatBusReplayEvent[] {
  if (viewerReadsHidden(viewer)) {
    return [...rows];
  }
  const scrubbers = new Map<number, HiddenSpanStreamScrubber>();
  const out: ChatBusReplayEvent[] = [];
  for (const { seq, event } of rows) {
    if (event.type === "delta") {
      const scrubbed = scrubDeltaEventForMember(event, scrubberFor(scrubbers, event.slotSeq), reasoningHostOnly);
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

/** Get-or-create the per-slot mid-stream scrubber for the durable replay (one stateful scrubber per streaming
 *  slot, exactly like the live transport's per-`slotSeq` map). */
function scrubberFor(scrubbers: Map<number, HiddenSpanStreamScrubber>, slotSeq: number): HiddenSpanStreamScrubber {
  const existing = scrubbers.get(slotSeq);
  if (existing !== undefined) {
    return existing;
  }
  const created = createHiddenSpanStreamScrubber();
  scrubbers.set(slotSeq, created);
  return created;
}
