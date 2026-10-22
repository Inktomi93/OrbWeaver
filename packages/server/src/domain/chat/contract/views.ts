// Internal chat views derive their canonical wire shapes; captured roles stay server-only until transport encoding.
// Replay witnesses below never acquire a second wire representation.

import type {
  ChatBusEvent,
  HistoryFloorSeq,
  MessageView,
  ChatDetail as WireChatDetail,
  ChatLineageView as WireChatLineageView,
  ChatListPage as WireChatListPage,
  ChatSummary as WireChatSummary,
  ParticipantView as WireParticipantView,
} from "@orb/contracts/chat";
import type { ParticipantRoleState } from "@orb/contracts/identity";
import type { ChatStreamGenerationId } from "@orb/kit/ids";

/** A resumable SSE token-log row (replayStreamEvents) — one streamed delta with its replay cursor
 *  ("resumable SSE stream log"; the db `chat_stream_events` row projected). */
export interface ChatStreamReplayEvent {
  readonly seq: number;
  readonly messageId: MessageView["id"] | null;
  readonly generationId: ChatStreamGenerationId | null;
  readonly kind: "text" | "reasoning";
  readonly delta: string;
}

/** A durable chat-bus log row (replayChatEvents) — one room-public `ChatBusEvent` with its per-chat replay
 *  cursor (the `chat_events` row projected). The chat room's SSE resume replays these; the live
 *  half rides the transport fan-out with the SAME `{seq, event}` shape (uniform `tracked()` envelopes). */
export interface ChatBusReplayEvent {
  readonly seq: number;
  readonly event: ChatBusEvent;
}

/** The replay cursor bounds (streamEventBounds / chatEventBounds) — the min/max `seq` of the chat's stream
 *  log / durable bus log (null/null when empty). The late-subscriber ramp-up reads these to size the replay
 *  window; `chatEventBounds` doubles as the cheap membership gate the SSE per-yield check calls. */
export interface StreamEventBounds {
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
export interface ChatEventAttach extends StreamEventBounds {
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
}

/** Wire fields derive from the canonical view; only the server's captured role representation differs. */
export interface ParticipantData extends Omit<WireParticipantView, "role"> {
  readonly role: ParticipantRoleState;
}
export interface ChatDetailData extends Omit<WireChatDetail, "participants"> {
  readonly participants: readonly ParticipantData[];
}
export interface ChatSummaryData extends Omit<WireChatSummary, "viewerRole"> {
  readonly viewerRole: ParticipantRoleState;
}
export interface ChatListPageData extends Omit<WireChatListPage, "items"> {
  readonly items: readonly ChatSummaryData[];
}
export interface ChatLineageData extends Omit<WireChatLineageView, "chain"> {
  readonly chain: readonly ChatSummaryData[];
}
