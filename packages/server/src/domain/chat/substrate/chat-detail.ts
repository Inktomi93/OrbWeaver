// The ONE `chats` row → `ChatDetail` projection, shared by every verb that returns a room detail
// (`verbs/read.ts` getChat, `verbs/fork.ts`, `verbs/invites.ts`, `verbs/start-chat.ts`). One shape, no
// drift: each verb loads its row (`loadChatRow`/`listMemberChats` — both yield the parsed-metadata chat
// row) + resolves its roster, then hands the pieces here. The viewer-relative fields (`viewerIsHost`,
// `viewerActivePersonaId`) derive from the roster ⋈ `viewerUserId`.

import type { CharacterAvatarEntry, ChatMacroNameProducer, ChatMetadata, ParticipantView, PersonaAvatarEntry } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG, DEFAULT_ROOM_OVERRIDES } from "@orb/contracts/chat";
import type { ChatId, PersonaId, UserId } from "@orb/kit/ids";
import type { ChatDetail } from "../contract/views";
import { NO_HISTORY_FLOOR } from "./auth";
import { viewerHoldsHost } from "./member-visibility";

/** The projected `chats` row (metadata already parsed) — structurally the persistence `ChatRow`, which
 *  both `loadChatRow` and `listMemberChats` return. Only the fields `ChatDetail` reads. */
interface ChatDetailRow {
  readonly id: ChatId;
  readonly title: string | null;
  readonly star: boolean;
  readonly archived: boolean;
  readonly temporary: boolean;
  readonly parentChatId: ChatId | null;
  readonly forkedAt: number | null;
  readonly anchorPersonaId: PersonaId | null;
  readonly pendingHostUserId: UserId | null;
  readonly compactSummary: string | null;
  readonly compactedAtSeq: number | null;
  readonly metadata: ChatMetadata;
  readonly createdAt: number;
  readonly updatedAt: number;
}

interface ToChatDetailInput {
  readonly chat: ChatDetailRow;
  readonly participants: readonly ParticipantView[];
  readonly macroNames: ChatMacroNameProducer;
  readonly personaAvatars: readonly PersonaAvatarEntry[];
  readonly characterAvatars: readonly CharacterAvatarEntry[];
  readonly viewerUserId: UserId;
  /** The viewer's D16 join-history floor (`substrate/auth::resolveHistoryFloorSeq`). REQUIRED, not defaulted,
   *  so a new `ChatDetail` producer must state the viewer's clamp rather than inherit an open one. */
  readonly viewerHistoryFloorSeq: number;
}

/** Map a loaded chat row + its resolved roster + macro name producer → `ChatDetail`.
 *
 *  The COMPACTION CHECKPOINT is D16-clamped here (the one home every detail producer shares): the summary is
 *  model-written prose covering canon from seq 1 through `compactedAtSeq`, so ANY clamped viewer
 *  (`viewerHistoryFloorSeq > 0`) would be reading a distillation of the transcript their floor withholds.
 *  Both fields drop together — a `compactedAtSeq` with no summary is a divider anchored to nothing. */
export function toChatDetail({
  chat,
  participants,
  macroNames,
  personaAvatars,
  characterAvatars,
  viewerUserId,
  viewerHistoryFloorSeq,
}: ToChatDetailInput): ChatDetail {
  const viewer = participants.find((p) => p.userId === viewerUserId);
  const checkpointVisible = viewerHistoryFloorSeq <= NO_HISTORY_FLOOR;
  return {
    id: chat.id,
    title: chat.title,
    star: chat.star,
    archived: chat.archived,
    temporary: chat.temporary,
    parentChatId: chat.parentChatId,
    forkedAt: chat.forkedAt,
    anchorPersonaId: chat.anchorPersonaId,
    participants,
    viewerActivePersonaId: viewer?.activePersonaId ?? null,
    // A role-derived PAYLOAD field, not a gate — DERIVED from its class home (`member-visibility.ts`, the
    // role-PROJECTION class, D106-F1: consumers thread the verdict as DATA), never the
    // `auth/decide.ts::permitsHost` enforcement class. The import IS the cross-cite: there is one
    // `role === "host"` comparison and this is a caller of it, not a copy. Deliberately no `Principal`/
    // `can()` here; the server gates every host-only surface separately.
    viewerIsHost: viewerHoldsHost(viewer),
    viewerUserId,
    pendingHostUserId: chat.pendingHostUserId,
    group: chat.metadata.group ?? DEFAULT_GROUP_CONFIG,
    roomOverrides: chat.metadata.roomOverrides ?? DEFAULT_ROOM_OVERRIDES,
    toolRecurseLimit: chat.metadata.toolRecurseLimit ?? null,
    background: chat.metadata.background ?? null,
    rpg: chat.metadata.rpg ?? null,
    opening: chat.metadata.opening ?? null,
    compactSummary: checkpointVisible ? chat.compactSummary : null,
    compactedAtSeq: checkpointVisible ? chat.compactedAtSeq : null,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    macroNames,
    personaAvatars,
    characterAvatars,
  };
}
