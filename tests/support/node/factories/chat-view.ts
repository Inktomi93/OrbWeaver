// Wire-output builders for the chat reads a tRPC responder answers (`chat.getChat`, `chat.listChats`,
// `chat.startChat`, `invites.redeemInvite`). Each parses its defaults through the contract schema, so a new
// required field fails here once instead of silently passing every fixture; an override is spread after the parse.

import {
  chatDetailSchema,
  chatListPageSchema,
  chatSummarySchema,
  createInviteResultSchema,
  DEFAULT_GROUP_CONFIG,
  DEFAULT_ROOM_OVERRIDES,
  participantViewSchema,
  redeemInviteResultSchema,
  SHAPE_BREAKPOINT_DECISIONS,
  shapeTraceSchema,
  startChatResultSchema,
  TALKATIVENESS_DEFAULT,
} from "@orb/contracts/chat";
import { viewerViewSchema } from "@orb/contracts/identity";
import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId, mintUserId } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";
import type { TrpcWireOutput } from "../route-trpc.ts";

const ids = createSeededIds();

type ChatDetailWire = TrpcWireOutput<"chat.getChat">;
type ParticipantWire = ChatDetailWire["participants"][number];
type ChatListPageWire = TrpcWireOutput<"chat.listChats">;
type ChatSummaryWire = ChatListPageWire["items"][number];
type StartChatWire = TrpcWireOutput<"chat.startChat">;
type RedeemInviteWire = TrpcWireOutput<"invites.redeemInvite">;
type CreateInviteWire = TrpcWireOutput<"invites.createInvite">;
type ShapeTraceWire = TrpcWireOutput<"chat.getShapeTrace">;

/** A room id from the sequence the builders below mint from, so a caller's room never collides with theirs. */
export function makeChatId(): ChatId {
  return mintTypeId(ID_PREFIX.chat, ids.next);
}

/** One roster seat: a character seat by default, at the shipped talkativeness. */
export function makeParticipantView(overrides: Partial<ParticipantWire> = {}): ParticipantWire {
  return {
    ...participantViewSchema.parse({
      id: ids.next(ID_PREFIX.chatParticipant),
      chatId: makeChatId(),
      kind: "character",
      userId: null,
      characterId: ids.next(ID_PREFIX.character),
      role: "member",
      activePersonaId: null,
      talkativeness: TALKATIVENESS_DEFAULT,
      disabled: false,
      joinedAt: FROZEN_AT_MS,
      joinSeq: 1,
      leftSeq: null,
      joinHistoryVisibility: "full",
      displayName: "Aria",
      handle: null,
      avatarAssetId: null,
      avatarHash: null,
    }),
    ...overrides,
  };
}

/** The full read carries the default host's human seat; explicit rosters remain caller-owned. */
export function makeChatDetail(overrides: Partial<ChatDetailWire> = {}): ChatDetailWire {
  const chatId = overrides.id ?? makeChatId();
  const userId = overrides.viewerUserId ?? mintUserId(ids.next);
  const handle = viewerViewSchema.shape.handle.parse("chat-host");
  const participant = makeParticipantView({
    chatId,
    kind: "human",
    userId,
    characterId: null,
    role: overrides.viewerIsHost === false ? "member" : "host",
    displayName: handle,
    handle,
    joinSeq: 0,
  });
  return {
    ...chatDetailSchema.parse({
      id: chatId,
      title: null,
      starred: false,
      archived: false,
      temporary: false,
      parentChatId: null,
      forkedAt: null,
      anchorPersonaId: null,
      anchorState: "none",
      participants: [participant],
      viewerActivePersonaId: null,
      viewerIsHost: true,
      viewerUserId: userId,
      viewerOwnedCharacterIds: [],
      viewerGalleryCharacterId: null,
      pendingHostUserId: null,
      group: DEFAULT_GROUP_CONFIG,
      roomOverrides: DEFAULT_ROOM_OVERRIDES,
      toolRecurseLimit: null,
      hostDisplayScripts: false,
      offerChoices: null,
      charactersCanReact: null,
      reactionsEnabled: null,
      memberPersonaLore: true,
      background: null,
      rpg: null,
      opening: null,
      compactSummary: null,
      compactedAtSeq: null,
      createdAt: FROZEN_AT_MS,
      updatedAt: FROZEN_AT_MS,
      identities: [],
    }),
    ...overrides,
  };
}

/** One `chat.listChats` row: a host's quiet room with no messages and no seats. */
export function makeChatSummaryView(overrides: Partial<ChatSummaryWire> = {}): ChatSummaryWire {
  return chatSummarySchema.parse({
    id: makeChatId(),
    title: null,
    starred: false,
    archived: false,
    lastMessageAt: null,
    viewerLastTurnAt: null,
    messageCount: 0,
    lastMessagePreview: null,
    isGame: false,
    gamePaused: false,
    participantNames: [],
    participantPortraits: [],
    viewerRole: "host",
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
    ...overrides,
  });
}

/** A `chat.listChats` page over `items`; `totalCount` is the item count unless the override says otherwise. */
export function makeChatListPage(items: ChatListPageWire["items"] = [], overrides: Partial<ChatListPageWire> = {}): ChatListPageWire {
  return {
    ...chatListPageSchema.parse({ items: [], nextCursor: null, totalCount: 0, viewerLastTurnAt: null }),
    items,
    totalCount: items.length,
    ...overrides,
  };
}

/** The `chat.startChat` result: a fresh room and no seeded opening. */
export function makeStartChatResult(overrides: Partial<StartChatWire> = {}): StartChatWire {
  return { ...startChatResultSchema.parse({ chat: makeChatDetail(), opening: null }), ...overrides };
}

/** The `invites.redeemInvite` result: the joined room and the new member's own roster row. */
export function makeRedeemInviteResult(overrides: Partial<RedeemInviteWire> = {}): RedeemInviteWire {
  const userId = mintUserId(ids.next);
  const handle = viewerViewSchema.shape.handle.parse("invite-member");
  const chat = makeChatDetail({ viewerIsHost: false, viewerUserId: userId });
  const participant = makeParticipantView({
    chatId: chat.id,
    kind: "human",
    userId,
    characterId: null,
    displayName: handle,
    handle,
  });
  const defaults = redeemInviteResultSchema.parse({ chat: { ...chat, participants: [participant] }, participant });
  return {
    ...defaults,
    ...overrides,
    participant: overrides.participant ?? {
      ...defaults.participant,
      chatId: overrides.chat?.id ?? chat.id,
      userId: overrides.chat?.viewerUserId ?? chat.viewerUserId,
    },
  };
}

/** The `invites.createInvite` result: a pending open link with one minted token. */
export function makeCreateInviteResult(overrides: Partial<CreateInviteWire> = {}): CreateInviteWire {
  return {
    ...createInviteResultSchema.parse({
      invite: {
        id: ids.next(ID_PREFIX.chatInvite),
        chatId: makeChatId(),
        status: "pending",
        maxUses: null,
        remainingUses: null,
        expiresAt: null,
        invitedUserId: null,
        allowSignup: false,
        createdAt: FROZEN_AT_MS,
      },
      token: "tok_ct_minted",
    }),
    ...overrides,
  };
}

/** The content-free `chat.getShapeTrace` read for a single-character room that placed its cache breakpoint. */
export function makeShapeTrace(overrides: Partial<ShapeTraceWire> = {}): ShapeTraceWire {
  return {
    ...shapeTraceSchema.parse({
      multiCharacter: false,
      stageCounts: { withTail: 0, injected: 0, squashed: 0, named: 0 },
      squashMerges: 0,
      breakpointDecision: SHAPE_BREAKPOINT_DECISIONS[0],
      rows: [],
    }),
    ...overrides,
  };
}
