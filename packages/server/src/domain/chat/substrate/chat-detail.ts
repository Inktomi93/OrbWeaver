// The ONE `chats` row → `ChatDetailData` projection, shared by every verb that returns a room detail
// (`verbs/read.ts` getChat, `verbs/fork.ts`, `verbs/invites.ts`, `verbs/start-chat.ts`). One shape, no
// drift: each verb loads its row (`loadChatRow`/`listMemberChats` — both yield the parsed-metadata chat
// row) + resolves its roster, then hands the pieces here. The viewer-relative fields (`viewerIsHost`,
// `viewerActivePersonaId`) derive from the roster ⋈ `viewerUserId`; `viewerOwnedCharacterIds` needs an
// ownership read, so the verb resolves it (`substrate/viewer-gallery.ts`), and the gallery subject derives here.

import type { ChatIdentity, ParticipantData } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG, DEFAULT_ROOM_OVERRIDES, resolveHostDisplayScripts, resolveNarratorRenderPolicy } from "@orb/contracts/chat";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { ChatDetailData } from "../contract/views.ts";
import type { ResolvedAnchor } from "../persistence/anchor.ts";
import type { loadChatRow } from "../persistence/queries.ts";
import { viewerHoldsHost } from "./member-visibility.ts";
import { viewerGalleryCharacterIdOf } from "./viewer-gallery.ts";

/** The projected `chats` row (metadata already parsed): persistence's `ChatRow`, which both `loadChatRow` and
 *  `listMemberChats` return, read-only here. */
type ChatDetailRow = Readonly<NonNullable<Awaited<ReturnType<typeof loadChatRow>>>>;

interface ToChatDetailInput {
  readonly chat: ChatDetailRow;
  readonly participants: readonly ParticipantData[];
  readonly identities: readonly ChatIdentity[];
  readonly viewerUserId: UserId;
  /** `resolveViewerOwnedCharacterIds` over the same roster. REQUIRED, not defaulted, so a new producer states it. */
  readonly viewerOwnedCharacterIds: readonly CharacterId[];
  /** `resolveAnchor` over the same roster (`substrate/participants-humans.ts`). */
  readonly anchor: ResolvedAnchor;
}

/** Map a loaded chat row + its resolved roster + chat-identity producer → `ChatDetailData`. */
export function toChatDetail({ chat, participants, identities, viewerUserId, viewerOwnedCharacterIds, anchor }: ToChatDetailInput): ChatDetailData {
  const viewer = participants.find((p) => p.userId === viewerUserId);
  const narratorRender = resolveNarratorRenderPolicy(participants);
  return {
    id: chat.id,
    title: chat.title,
    archived: chat.archived,
    temporary: chat.temporary,
    parentChatId: chat.parentChatId,
    forkedAt: chat.forkedAt,
    anchorPersonaId: chat.anchorPersonaId,
    anchorState: anchor.state,
    anchorOwnerHandle: anchor.ownerHandle,
    participants,
    ...(narratorRender === undefined ? {} : { narratorRender }),
    viewerActivePersonaId: viewer?.activePersonaId ?? null,
    // A role-derived PAYLOAD field, not a gate — DERIVED from its class home (`member-visibility.ts`, the
    // role-PROJECTION class, D106-F1: consumers thread the verdict as DATA), never the
    // `auth/decide.ts::permitsHost` enforcement class. The import IS the cross-cite: there is one
    // `role === "host"` comparison and this is a caller of it, not a copy. Deliberately no `Principal`/
    // `can()` here; the server gates every host-only surface separately.
    viewerIsHost: viewerHoldsHost(viewer),
    viewerUserId,
    viewerOwnedCharacterIds,
    viewerGalleryCharacterId: viewerGalleryCharacterIdOf(participants, viewerOwnedCharacterIds),
    pendingHostUserId: chat.pendingHostUserId,
    group: chat.metadata.group ?? DEFAULT_GROUP_CONFIG,
    roomOverrides: chat.metadata.roomOverrides ?? DEFAULT_ROOM_OVERRIDES,
    toolRecurseLimit: chat.metadata.toolRecurseLimit ?? null,
    hostDisplayScripts: resolveHostDisplayScripts(chat.metadata.hostDisplayScripts),
    // `?? null`: absent is the INHERIT state here, and collapsing it to `false` would tell the host's toggle that a
    // never-touched room is pinned off (the toolRecurseLimit shape, not the resolved hostDisplayScripts one).
    offerChoices: chat.metadata.offerChoices ?? null,
    // B7 — the same tri-state shape as offerChoices (absent = inherit the host's per-user default).
    charactersCanReact: chat.metadata.charactersCanReact ?? null,
    reactionsEnabled: chat.metadata.reactionsEnabled ?? null,
    memberPersonaLore: chat.metadata.memberPersonaLore !== false,
    background: chat.metadata.background ?? null,
    rpg: chat.metadata.rpg ?? null,
    createdAt: chat.createdAt,
    identities,
  };
}
