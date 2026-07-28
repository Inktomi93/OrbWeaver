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
// Reasoning-channel deltas pass through unchanged, exactly as the commit strip leaves `view.reasoning` alone
// (a reasoning leak is model-discipline, not a body-projection concern — the tagged grammar is body prose).

import type { ChatBusEvent, ChatDeltaEvent, MessageView } from "@orb/contracts/chat";
import type { HiddenSpanStreamScrubber } from "@orb/kit/content";
import { createHiddenSpanStreamScrubber, stripHiddenSpans } from "@orb/kit/content";
import type { ChatStreamReplayEvent } from "../contract/views";

/** Strip hidden-class spans from one message view's content. Identity when nothing is hidden (the common
 *  case allocates nothing). Only `content` carries body prose; `reasoning` is model thinking, not a tagged
 *  channel (a reasoning leak is a model-discipline issue, not a payload projection). */
export function stripHiddenForMember(view: MessageView): MessageView {
  const { content, hadHidden } = stripHiddenSpans(view.content);
  return hadHidden ? { ...view, content } : view;
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
 *  (§3.6). The turn verbs (`send`/`swipe`/`continueTurn`/`impersonate`/`generate`) resolve a `TurnOutcome`
 *  whose `messages` carry the freshly-committed assistant reply — a member who ran the turn would otherwise
 *  receive the model's `<lie>` truth in the HTTP return payload (a devtools-only leak, exactly the class the
 *  bus/list strips already close). The host reads the outcome verbatim (the reveal-eye plane). Identity for a
 *  host or an all-clean outcome (no per-row churn). */
export function stripMessagesForViewer<T extends { readonly messages: readonly MessageView[] }>(outcome: T, viewer: ViewerRole): T {
  if (viewerReadsHidden(viewer) || outcome.messages.length === 0) {
    return outcome;
  }
  return { ...outcome, messages: outcome.messages.map(stripHiddenForMember) };
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

/** Strip the `view` payload of a view-carrying bus event for a non-host subscriber. Events without a view
 *  (deltas, lifecycle, warnings) pass through — DELTAs are handled separately by the mid-stream scrubber
 *  (`scrubDeltaEventForMember`); this function is the AT-COMMIT / durable-view arm. */
export function stripChatEventForMember(event: ChatBusEvent): ChatBusEvent {
  if (!isViewCarrying(event)) {
    return event;
  }
  return event.view === undefined ? event : { ...event, view: stripHiddenForMember(event.view) };
}

/** The mid-stream scrubber verdict for one `delta` bus event toward a NON-HOST subscriber (§3.6). The
 *  `text`-channel delta is fed to the caller-owned per-slot scrubber; the returned event carries only the
 *  bytes provably safe this tick (a `null` return = nothing safe emitted → the transport SKIPS the yield, so
 *  the member never sees an empty delta). A `reasoning`-channel delta passes through unchanged (the tagged
 *  hidden grammar is body prose; the commit strip likewise leaves `reasoning` alone). A non-delta event is a
 *  programming error at this seam and returns unchanged. The SCRUBBER is stateful and per-slot — the transport
 *  owns one per `slotSeq` for the subscriber's lifetime and NEVER shares it with a host (a host reads
 *  verbatim). */
export function scrubDeltaEventForMember(event: Extract<ChatBusEvent, { type: "delta" }>, scrubber: HiddenSpanStreamScrubber): ChatBusEvent | null {
  if (event.delta.kind !== "text") {
    return event;
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
export function scrubStreamReplayForMember(rows: readonly ChatStreamReplayEvent[], viewer: ViewerRole): ChatStreamReplayEvent[] {
  if (viewerReadsHidden(viewer)) {
    return [...rows];
  }
  const scrubbers = new Map<string, HiddenSpanStreamScrubber>();
  const out: ChatStreamReplayEvent[] = [];
  for (const row of rows) {
    if (row.kind !== "text" || row.messageId === null) {
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
