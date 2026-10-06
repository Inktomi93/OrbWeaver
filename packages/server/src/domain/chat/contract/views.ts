// domain/chat/contract/views — the client read-models the chat service returns. One home for the shapes
// (§7.4 / types-in-contract). Cross-boundary read-models that
// already live in `@orb/contracts/chat` (the wire node) are RE-EXPORTED here type-only (derive-don't-respell,
// §7.5) so the service signatures + the front door reference one name — they are NOT re-declared:
//   • MessageView        — the D26 slot⋈selected-variant read-model (listMessages / turn results).
//   • ParticipantView    — the resolved roster row (listParticipants / roster mutators).
//   • SectionPreview     — one section's render preview (previewSection).
//   • AssembledPrompt    — the BUILD product (peekPrompt / the assembly preview body).
//
// Transport-visible list, turn and preview projections are also owned by @orb/contracts/chat.
// Snapshot witnesses, replay and attach shapes below remain internal persistence/transport/engine contracts.

import type { ChatBusEvent, MessageView } from "@orb/contracts/chat";
import type { messageVariants } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import type { ChatStreamGenerationId, MessageVariantId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";

export type {
  AssembledPrompt,
  // The full chat read (getChat, fork, start, the invite joins) — a wire node: its strict twin
  // (`chatDetailSchema`) is the invite joins' tRPC output parser.
  ChatDetail,
  // The fork-lineage chain (getChatLineage) — a wire node: `chatLineageViewSchema` is its tRPC output parser.
  ChatLineageView,
  // The present-tense context-fit answer (previewContextFit) — the cross-boundary wire node (`@orb/contracts/chat`),
  // re-exported type-only so the service + front door share the ONE name.
  ContextFitAnswer,
  InvitePreview,
  InviteView,
  MessagesPage,
  MessageView,
  MessageWindow,
  ParticipantView,
  SectionPreview,
  // The content-free SHAPE trace (getShapeTrace) — the cross-boundary wire node (`@orb/contracts/chat`),
  // re-exported type-only so the service signature + front door reference the ONE name (derive-don't-respell).
  ShapeTrace,
  // The per-variant WIRE RECORD (getVariantWire) — the cross-boundary wire node (`@orb/contracts/chat`),
  // re-exported type-only for the same reason. HOST-ONLY payload (see its contract header).
  VariantWireView,
} from "@orb/contracts/chat";

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
  readonly historyFloorSeq: number;
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

export type {
  ActionTemplatesPreview,
  AssemblyPreview,
  ChatInjectionView,
  ChatListPage,
  ChatSeatPortrait,
  ChatSummary,
  ChatVariables,
  MessageVariantSummary,
  UserMacroPicksView,
  VariablePicksView,
} from "@orb/contracts/chat";

/** A selected continuation's immutable read witness; raw private JSON is compared, never sent on the wire. */
export interface ContinueSnapshot
  extends Readonly<
    Pick<
      typeof messageVariants.$inferSelect,
      "content" | "reasoning" | "preContinueContent" | "preContinueReasoning" | "lastContinuationContent" | "lastContinuationReasoning"
    >
  > {
  readonly variantId: MessageVariantId;
  readonly rawMetadata: string | null;
  readonly rawToolCalls: string | null;
}

/** The first-write admission witness is retained so unrelated DB failures cannot become stale refusals. */
export interface ContinueRestorePlan {
  readonly selection: SQL;
  readonly statements: BatchStmt[];
}
