// Internal chat views derive their canonical wire shapes; captured roles stay server-only until transport encoding.
// Replay witnesses below never acquire a second wire representation.

import type {
  ChatBusEvent,
  HistoryFloorSeq,
  MessageView,
  ParticipantData,
  ChatDetail as WireChatDetail,
  ChatLineageView as WireChatLineageView,
  ChatListPage as WireChatListPage,
  ChatSummary as WireChatSummary,
} from "@orb/contracts/chat";
import type { ParticipantRoleState } from "@orb/contracts/identity";
import type { ChatTurnId } from "@orb/kit/ids";

export type MessageWindowAnchor = Pick<MessageView, "id" | "seq">;
export type MessageWindowResolution =
  | { readonly outcome: "deleted" | "unavailable"; readonly anchor: null; readonly end: null }
  | { readonly outcome: "resolved" | "moved"; readonly anchor: MessageWindowAnchor; readonly end: MessageWindowAnchor };

/** A durable chat-bus log row (replayChatEvents) — one room-public `ChatBusEvent` with its per-chat replay
 *  cursor (the `chat_events` row projected). The chat room's SSE resume replays these; the live
 *  half rides the transport fan-out with the SAME `{seq, event}` shape (uniform `tracked()` envelopes). */
export interface ChatBusReplayEvent {
  readonly seq: number;
  readonly event: ChatBusEvent;
}

/** The `chatEventBounds` cursor bounds — the min/max `seq` of the durable bus log (null/null when empty). The
 *  late-subscriber ramp-up reads these to size the replay window; the probe doubles as the cheap membership
 *  gate the SSE per-yield check calls. */
export interface ChatEventBounds {
  readonly minSeq: number | null;
  readonly maxSeq: number | null;
}

/** What the SSE attach / per-yield probe (`chatEventBounds`) hands the subscription: the retained-window
 *  bounds PLUS the caller's own D16 canon read floor, resolved at the membership chokepoint
 *  (`guard.requireParticipant` → `substrate/auth::resolveHistoryFloorSeq`).
 *
 *  The floor rides HERE rather than being re-derived at the transport because that probe is ALREADY the one
 *  member-gated read the subscription performs (at attach and before every live yield): the same read that
 *  decides "may this caller still receive at all" now also carries "…and from which `messages.seq` up". It is
 *  therefore per-CALLER by construction and never client-supplied. `0` = unclamped (`full` / a born-here host
 *  seat) — the common case, which the `isBelowHistoryFloor` verdict short-circuits on. */
export interface ChatEventAttach extends ChatEventBounds {
  readonly historyFloorSeq: HistoryFloorSeq;
  /** Whether the SUBSCRIBER is the room host — resolved from their own participant row at the same probe.
   *  The live fan-out applies the §3.6 hidden-content member-strip (`stripChatEventForMember`) when false,
   *  mirroring the per-caller strip the durable replay applies. Never client-supplied. */
  readonly viewerIsHost: boolean;
  /** P3 (§3.6): is the game rooted at this chat DECEPTION-ACTIVE (`config.features.deception || omniscience`)?
   *  Resolved once at attach via the injected `ChatRpgOps.resolveReasoningHostOnly` (chat stays rpg-table-blind).
   *  When true AND the subscriber is NOT the host, the live fan-out withholds the whole reasoning channel for
   *  that member (reasoning deltas + `reasoningStreamDone` dropped, `view.reasoning` nulled). `false` for a
   *  non-game / non-deception chat — the pre-P3 live behavior (reasoning member-visible). Never client-supplied. */
  readonly reasoningHostOnly: boolean;
  /** The room's turns in flight, which the attach's `chatOpened` hands the device. */
  readonly openTurnIds: readonly ChatTurnId[];
  /** The subscriber's position for the probe's `positionOf` row; absent when the row is outside their history. */
  readonly messagePosition?: number;
}

export interface ChatDetailData extends Omit<WireChatDetail, "participants"> {
  readonly participants: readonly ParticipantData[];
}
export type ChatSummaryData = WireChatSummary extends infer Summary
  ? Summary extends WireChatSummary
    ? Pick<Summary, Exclude<keyof Summary, "viewerRole">> & { readonly viewerRole: ParticipantRoleState }
    : never
  : never;
export interface ChatListPageData extends Omit<WireChatListPage, "items"> {
  readonly items: readonly ChatSummaryData[];
}
export interface ChatLineageData extends Omit<WireChatLineageView, "chain"> {
  readonly chain: readonly ChatSummaryData[];
}
