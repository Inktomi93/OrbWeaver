// The ONE `chats` row → `ChatDetail` projection, shared by every verb that returns a room detail
// (`verbs/read.ts` getChat, `verbs/fork.ts`, `verbs/invites.ts`, `verbs/start-chat.ts`). One shape, no
// drift: each verb loads its row (`loadChatRow`/`listMemberChats` — both yield the parsed-metadata chat
// row) + resolves its roster, then hands the pieces here. The viewer-relative fields (`viewerIsHost`,
// `viewerActivePersonaId`) derive from the roster ⋈ `viewerUserId`.

import type { ChatMacroNameProducer, ChatMetadata, ParticipantView, PersonaAvatarEntry } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG, DEFAULT_ROOM_OVERRIDES } from "@orb/contracts/chat";
import type { ChatId, PersonaId, UserId } from "@orb/kit/ids";
import type { ChatDetail } from "../contract/views";

/** The projected `chats` row (metadata already parsed) — structurally the persistence `ChatRow`, which
 *  both `loadChatRow` and `listMemberChats` return. Only the fields `ChatDetail` reads. */
interface ChatDetailRow {
  readonly id: ChatId;
  readonly title: string | null;
  readonly star: boolean;
  readonly archived: boolean;
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
  readonly viewerUserId: UserId;
}

/** Map a loaded chat row + its resolved roster + macro name producer → `ChatDetail`. */
export function toChatDetail({ chat, participants, macroNames, personaAvatars, viewerUserId }: ToChatDetailInput): ChatDetail {
  const viewer = participants.find((p) => p.userId === viewerUserId);
  return {
    id: chat.id,
    title: chat.title,
    star: chat.star,
    archived: chat.archived,
    parentChatId: chat.parentChatId,
    forkedAt: chat.forkedAt,
    anchorPersonaId: chat.anchorPersonaId,
    participants,
    viewerActivePersonaId: viewer?.activePersonaId ?? null,
    viewerIsHost: viewer?.role === "host",
    viewerUserId,
    pendingHostUserId: chat.pendingHostUserId,
    group: chat.metadata.group ?? DEFAULT_GROUP_CONFIG,
    roomOverrides: chat.metadata.roomOverrides ?? DEFAULT_ROOM_OVERRIDES,
    background: chat.metadata.background ?? null,
    opening: chat.metadata.opening ?? null,
    compactSummary: chat.compactSummary,
    compactedAtSeq: chat.compactedAtSeq,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    macroNames,
    personaAvatars,
  };
}
