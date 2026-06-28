// domain/chat/contract/views — the client read-models the chat service returns (chat.md Part I 8-slot
// `contract/views.ts`). One home for the shapes (§7.4 / types-in-contract). Cross-boundary read-models that
// already live in `@orb/contracts/chat` (the wire node) are RE-EXPORTED here type-only (derive-don't-respell,
// §7.5) so the service signatures + the front door reference one name — they are NOT re-declared:
//   • MessageView        — the D26 slot⋈selected-variant read-model (listMessages / turn results).
//   • ParticipantView    — the resolved roster row (listParticipants / roster mutators).
//   • SectionPreview     — one section's render preview (previewSection).
//   • AssembledPrompt    — the BUILD product (peekPrompt / the assembly preview body).
//
// The chat-DOMAIN-specific read-models (the list/detail/lineage/pool projections) are declared here.

import type {
  AssembledPrompt,
  AssembleTrace,
  ChatInjection,
  GroupConfig,
  MessageView,
  OpeningPolicy,
  ParticipantView,
  RoomOverrides,
} from "@orb/contracts/chat";
import type { ChatId, ChatInjectionId, WorldEntryId } from "@orb/kit/ids";

export type {
  AssembledPrompt,
  InvitePreview,
  InviteView,
  MessageView,
  ParticipantView,
  SectionPreview,
} from "@orb/contracts/chat";

/** The library-list row (listChats) — light, membership-scoped (D18: a chat I host OR am a member of; there
 *  is no `ownerId`). `lastMessageAt`/`messageCount` drive the list ordering + the unread chrome; `parentChatId`
 *  marks a fork in the list. */
export interface ChatSummary {
  readonly id: ChatId;
  readonly title: string | null;
  readonly star: boolean;
  readonly archived: boolean;
  /** The fork-lineage pointer (D27) — null for a root chat. */
  readonly parentChatId: ChatId | null;
  /** The seq/timestamp of the newest message (null for an empty just-created chat). */
  readonly lastMessageAt: number | null;
  readonly messageCount: number;
  /** The resolved present cast for the list-card avatars (names only — the heavy roster is `getChat`). */
  readonly participantNames: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** The full chat read (getChat) — the row resolved + the present roster + the effective room behavior
 *  (`group`/`roomOverrides`/`opening` parsed from `metadata`, fault-isolated to their defaults). The message
 *  list is fetched separately (listMessages, paged). */
export interface ChatDetail {
  readonly id: ChatId;
  readonly title: string | null;
  readonly star: boolean;
  readonly archived: boolean;
  readonly parentChatId: ChatId | null;
  readonly forkedAt: number | null;
  /** The stable `{{user}}` anchor persona (chat-open POV for card-authored sections). */
  readonly anchorPersonaId: ParticipantView["activePersonaId"];
  readonly participants: readonly ParticipantView[];
  /** The effective room behavior (parsed from `metadata`; defaults applied — never raw). */
  readonly group: GroupConfig;
  readonly roomOverrides: RoomOverrides;
  readonly opening: OpeningPolicy | null;
  /** The portable compaction checkpoint (D25) — the summary text + the seq it covers through. */
  readonly compactSummary: string | null;
  readonly compactedAtSeq: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** The fork-lineage chain (getChatLineage) — the chat's ancestors then self, oldest-root first. Each ancestor
 *  is walked + gated INDEPENDENTLY (a fork grants NO parent membership — chat.md inv §16/§12); a hidden/
 *  not-a-member ancestor is omitted, so the chain may be sparse. */
export interface ChatLineageView {
  /** Oldest ancestor → … → this chat. Membership-gated per ancestor (omitted where not a member). */
  readonly chain: readonly ChatSummary[];
}

/** The assembly preview (previewAssembly) — the BUILD product for a hypothetical turn + the debug trace.
 *  Host/admin-only at the transport (the trace is metadata-about-assembly, never RP content). */
export interface AssemblyPreview {
  readonly prompt: AssembledPrompt;
  readonly trace: AssembleTrace;
}

/** One persisted positional injection (the `chat_injections` row resolved) — the `ChatInjection` wire shape
 *  plus its id. Returned by setChatInjection / listChatInjections. */
export interface ChatInjectionView extends ChatInjection {
  readonly id: ChatInjectionId;
}

/** The per-chat ChoiceBlock variable map (`{{get::<name>}}`) — getVariables (effective, computed-this-turn)
 *  and getStoredVariables (the persisted `chats.variableValues` flush) both return this shape. */
export type ChatVariables = Record<string, string>;

/** A resumable SSE token-log row (replayStreamEvents) — one streamed delta with its replay cursor (chat.md
 *  §"resumable SSE stream log"; the db `chat_stream_events` row projected). */
export interface ChatStreamReplayEvent {
  readonly seq: number;
  readonly messageId: MessageView["id"] | null;
  readonly kind: "text" | "reasoning";
  readonly delta: string;
}

/** The replay cursor bounds (streamEventBounds) — the min/max `seq` of the chat's stream log (null/null when
 *  empty). The late-subscriber ramp-up reads these to size the replay window. */
export interface StreamEventBounds {
  readonly minSeq: number | null;
  readonly maxSeq: number | null;
}

/** The 4-scope world-info pool resolved for a chat (the WI activation surface; chat.md `assembly/world-info/
 *  pool.ts` — the union STAYS chat). A read-model of which entries are in scope for this chat's next turn,
 *  for the WI panel + the activation preview (NOT the rendered prompt — that's `AssembledPrompt`). */
export interface WorldInfoPoolChat {
  readonly entries: readonly WorldInfoPoolEntry[];
}

/** One entry in the chat's resolved WI pool — identity + the scope it joined by + whether it fired. */
export interface WorldInfoPoolEntry {
  readonly id: WorldEntryId;
  /** The 4-scope provenance bucket the entry joined the pool by. */
  readonly scope: "global" | "character" | "persona" | "chat";
  readonly keys: readonly string[];
  readonly enabled: boolean;
}
