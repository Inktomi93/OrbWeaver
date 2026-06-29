// domain/chat/verbs/roster — the roster / group-config / room-override / membership-lifecycle MUTATION verbs
// (chat.md Part I 8-slot `verbs/roster.ts`; Part III §1 roster, §9 room overrides, §11 the auth matrix). Each
// verb is a FACTORY `createX(ctx, emit)`: it GATES via the membership chokepoint (`requireHost`/
// `requireParticipant` → `ctx.can`, never a `role==='host'` compare), MUTATES via persistence / a `ctx.db`
// inline write, then EMITS the room-public bus event (+ a `notifications` op where the design reaches a
// non-member). Group-ness is DATA: no `if(isGroup)` — solo is a roster-of-1, byte-identical (Part III §0).
//
// EMIT SEAM: the chat bus is chat's own in-process collaborator (NOT on `ChatContext` — see bus.ts), so the
// emitting factories take it as the SECOND arg, typed inline (`(e: ChatBusEvent) => Promise<void>`) because
// `types-in-contract` forbids an exported emit type outside `contract/`. The composition root wires
// `createChatBus(ctx).emit` into each.
//
// FLAG[no-roster-bus-event]: the `ChatBusEvent` union has NO dedicated roster/membership member (no
// `memberJoined`/`memberKicked`/`rosterChanged`/`groupConfigChanged`). The only fitting member is the
// `chatUpdated` catch-all ("low-payload chat-row changes") — so every roster/group/override/membership
// mutation emits `chatUpdated` (a "refetch the chat detail" signal). A dedicated roster event would need a
// new union member in `@orb/contracts/chat` (chunk 1, allowlist-gated) — out of this chunk's scope.
// FLAG[participant-not-found]: there is no `participant_not_found`/`target_not_member` code in `CHAT_OP_CODES`;
// the disable/talkativeness verbs map a missing roster target to `ChatNotFoundError` (→ NOT_FOUND) — the
// closest leak-free typed error. A dedicated code would tidy the message.
// FLAG[handoff]: `nominateHostHandoff`/`acceptHostHandoff` are NOT built — the two-party handoff needs a
// PERSISTED nomination (a `chat_participants.nominatedHostUserId` column or a `chat_host_nominations` table)
// to carry the pending nomination between the two verbs so `acceptHostHandoff` can SECURELY verify the caller
// was nominated. No such storage exists in the schema (chunk db/contracts owns it), and an accept that cannot
// verify the nomination is a self-promotion hole — so it is flagged, not stubbed.

import type { CharacterCard } from "@orb/contracts/character";
import type {
  ChatBusEvent,
  GroupConfig,
  ParticipantView,
  RoomOverrides,
} from "@orb/contracts/chat";
import {
  DEFAULT_GROUP_CONFIG,
  DEFAULT_ROOM_OVERRIDES,
  groupConfigSchema,
  roomOverridesSchema,
  TALKATIVENESS_DEFAULT,
} from "@orb/contracts/chat";
import { chatParticipants, chats } from "@orb/db";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { and, eq, isNull } from "drizzle-orm";
import type { ChatContext } from "../contract/context";
import { CHAT_OP_CODES, ChatNotFoundError, ChatOperationError } from "../contract/errors";
import type {
  AddCharacterToChatParams,
  GetGroupConfigForChatParams,
  GetRoomOverridesForChatParams,
  KickParticipantParams,
  SelfLeaveParams,
  SetGroupConfigParams,
  SetParticipantDisabledParams,
  SetParticipantTalkativenessParams,
  SetRoomOverridesParams,
} from "../contract/params";
import type { ChatService } from "../contract/service";
import { requireHost, requireParticipant } from "../guard";
import {
  assertForcedCharacterMember,
  insertParticipants,
  markUserLeft,
} from "../persistence/participant";
import { loadMaxMessageSeq } from "../persistence/queries";

/** The emit op the mutating roster verbs close over (inlined — see the file header `types-in-contract` note). */
type EmitChatEvent = (event: ChatBusEvent) => Promise<void>;

/** The extra collaborators the roster bundle needs beyond `ChatContext` (the chat bus emit — chat's own,
 *  not a ctx field; see bus.ts). One `deps` param per the grouped-file bundle convention. */
interface RosterDeps {
  readonly emit: EmitChatEvent;
}

/** The roster slice of `ChatService` this grouped file owns (the bundle the composition root spreads in). */
type RosterVerbs = Pick<
  ChatService,
  | "addCharacterToChat"
  | "setParticipantDisabled"
  | "setParticipantTalkativeness"
  | "setGroupConfig"
  | "setRoomOverrides"
  | "getGroupConfigForChat"
  | "getRoomOverridesForChat"
  | "kick"
  | "selfLeave"
>;

/**
 * The roster/group/override/membership-lifecycle verb BUNDLE (the grouped-file `create<File>` convention —
 * `verb-naming` gate). Folds the per-verb factories (internal below) into one object keyed by their
 * `ChatService` method names; the composition root spreads it into the full service.
 */
export function createRoster(ctx: ChatContext, deps: RosterDeps): RosterVerbs {
  const { emit } = deps;
  return {
    setGroupConfig: createSetGroupConfig(ctx, emit),
    setRoomOverrides: createSetRoomOverrides(ctx, emit),
    getGroupConfigForChat: createGetGroupConfigForChat(ctx),
    getRoomOverridesForChat: createGetRoomOverridesForChat(ctx),
    addCharacterToChat: createAddCharacterToChat(ctx, emit),
    setParticipantDisabled: createSetParticipantDisabled(ctx, emit),
    setParticipantTalkativeness: createSetParticipantTalkativeness(ctx, emit),
    kick: createKick(ctx, emit),
    selfLeave: createSelfLeave(ctx, emit),
  };
}

/** One resolved `chat_participants` row (the persistence read shape) → the `ParticipantView` read-model. A
 *  CHARACTER participant: `displayName`/`avatarAssetId` come from the live card (D28), `handle` is null (a
 *  character has no public handle). A null card (gone mid-delete) degrades the name to "" — never an error. */
function characterParticipantView(
  row: typeof chatParticipants.$inferSelect,
  card: CharacterCard | null,
): ParticipantView {
  return {
    id: row.id,
    chatId: row.chatId,
    kind: row.kind,
    userId: row.userId,
    characterId: row.characterId,
    role: row.role,
    activePersonaId: row.activePersonaId,
    talkativeness: row.talkativeness,
    disabled: row.disabled,
    joinedAt: row.joinedAt,
    joinSeq: row.joinSeq,
    leftSeq: row.leftSeq,
    joinHistoryVisibility: row.joinHistoryVisibility,
    displayName: card?.name ?? "",
    handle: null,
    avatarAssetId: card?.avatarAssetId ?? null,
  };
}

// ── group config / room overrides (host-only writes; member reads) ─────────────

/** `setGroupConfig` — host-only. Parse the lenient `GroupConfigInput` → a fully-defaulted `GroupConfig`,
 *  merge into `chatMetadata.group` (siblings preserved), persist, emit `chatUpdated`. */
function createSetGroupConfig(
  ctx: ChatContext,
  emit: EmitChatEvent,
): ChatService["setGroupConfig"] {
  return async ({ principal, chatId, config }: SetGroupConfigParams) => {
    const { chat } = await requireHost(ctx, principal, chatId);
    const parsed = groupConfigSchema.parse(config);
    await ctx.db
      .update(chats)
      .set({ metadata: { ...chat.metadata, group: parsed }, updatedAt: ctx.now() })
      .where(eq(chats.id, chatId));
    await emit({ type: "chatUpdated", chatId });
    return parsed;
  };
}

/** `setRoomOverrides` — host-only. The four-field allowlist (`roomOverridesSchema.strict()`) DEFAULT-DENIES a
 *  stray/`forbidRoomOverride` field (Part III §9) → `ChatOperationError('forbidden_override')`. */
function createSetRoomOverrides(
  ctx: ChatContext,
  emit: EmitChatEvent,
): ChatService["setRoomOverrides"] {
  return async ({ principal, chatId, overrides }: SetRoomOverridesParams) => {
    const { chat } = await requireHost(ctx, principal, chatId);
    const parsed = roomOverridesSchema.safeParse(overrides);
    if (!parsed.success) {
      throw new ChatOperationError(
        CHAT_OP_CODES.forbiddenOverride,
        `chat ${chatId}: room overrides accept only the four-field allowlist (scenario / mainPrompt / postHistory / authorsNote)`,
      );
    }
    await ctx.db
      .update(chats)
      .set({ metadata: { ...chat.metadata, roomOverrides: parsed.data }, updatedAt: ctx.now() })
      .where(eq(chats.id, chatId));
    await emit({ type: "chatUpdated", chatId });
    return parsed.data;
  };
}

/** `getGroupConfigForChat` — member. The effective `GroupConfig` (parsed sub-blob or the canonical default). */
function createGetGroupConfigForChat(ctx: ChatContext): ChatService["getGroupConfigForChat"] {
  return async ({ principal, chatId }: GetGroupConfigForChatParams): Promise<GroupConfig> => {
    const { chat } = await requireParticipant(ctx, principal, chatId);
    return chat.metadata.group ?? DEFAULT_GROUP_CONFIG;
  };
}

/** `getRoomOverridesForChat` — member. The effective `RoomOverrides` (parsed sub-blob or the empty default). */
function createGetRoomOverridesForChat(ctx: ChatContext): ChatService["getRoomOverridesForChat"] {
  return async ({ principal, chatId }: GetRoomOverridesForChatParams): Promise<RoomOverrides> => {
    const { chat } = await requireParticipant(ctx, principal, chatId);
    return chat.metadata.roomOverrides ?? DEFAULT_ROOM_OVERRIDES;
  };
}

// ── roster mutation (host-only) ────────────────────────────────────────────────

/** `addCharacterToChat` — host-only; the ONE character participant-insert chokepoint (D16). Stamps a fresh
 *  `member` row at the current canon head (`joinSeq`), emits `chatUpdated`, returns the resolved roster row.
 *  NB: ownership of the character is NOT hard-gated here — `getCard` is owner-scoped, so a foreign character
 *  resolves to a null card (name ""); the host UI only offers owned characters. */
function createAddCharacterToChat(
  ctx: ChatContext,
  emit: EmitChatEvent,
): ChatService["addCharacterToChat"] {
  return async ({ principal, chatId, characterId }: AddCharacterToChatParams) => {
    await requireHost(ctx, principal, chatId);
    const at = ctx.now();
    const joinSeq = await loadMaxMessageSeq(ctx.db, chatId);
    const participantId = ctx.newParticipantId();
    assertForcedCharacterMember({ kind: "character", role: "member" });
    await insertParticipants(ctx.db, [
      {
        id: participantId,
        chatId,
        kind: "character",
        characterId,
        role: "member",
        joinedAt: at,
        joinSeq,
      },
    ]);
    await emit({ type: "chatUpdated", chatId });
    const card = await ctx.getCard({ ownerId: principal.userId, characterId });
    return characterParticipantView(
      {
        id: participantId,
        chatId,
        kind: "character",
        userId: null,
        characterId,
        role: "member",
        activePersonaId: null,
        talkativeness: TALKATIVENESS_DEFAULT,
        disabled: false,
        joinedAt: at,
        joinSeq,
        leftSeq: null,
        joinHistoryVisibility: "from-join",
      },
      card,
    );
  };
}

/** Set a single field on a present CHARACTER participant (the disable/talkativeness shared write), returning
 *  the resolved view. A missing roster target → `ChatNotFoundError` (FLAG[participant-not-found]). `ownerId`
 *  is the host's id (host-only verb) — the card is read under host ownership for the view. */
async function updateCharacterParticipant(
  ctx: ChatContext,
  args: {
    readonly chatId: ChatId;
    readonly characterId: CharacterId;
    readonly ownerId: UserId;
    readonly patch: { readonly disabled: boolean } | { readonly talkativeness: number };
  },
): Promise<ParticipantView> {
  const { chatId, characterId, ownerId, patch } = args;
  const rows = await ctx.db
    .update(chatParticipants)
    .set(patch)
    .where(
      and(
        eq(chatParticipants.chatId, chatId),
        eq(chatParticipants.characterId, characterId),
        isNull(chatParticipants.leftSeq),
      ),
    )
    .returning();
  const row = rows.at(0);
  if (row === undefined) {
    throw new ChatNotFoundError(chatId);
  }
  const card = await ctx.getCard({ ownerId, characterId });
  return characterParticipantView(row, card);
}

/** `setParticipantDisabled` — host-only mute/unmute (cards/WI still contribute; excluded from arbitration). */
function createSetParticipantDisabled(
  ctx: ChatContext,
  emit: EmitChatEvent,
): ChatService["setParticipantDisabled"] {
  return async ({ principal, chatId, characterId, disabled }: SetParticipantDisabledParams) => {
    await requireHost(ctx, principal, chatId);
    const view = await updateCharacterParticipant(ctx, {
      chatId,
      characterId,
      ownerId: principal.userId,
      patch: { disabled },
    });
    await emit({ type: "chatUpdated", chatId });
    return view;
  };
}

/** `setParticipantTalkativeness` — host-only 0–1 natural-arbitration sampling weight. */
function createSetParticipantTalkativeness(
  ctx: ChatContext,
  emit: EmitChatEvent,
): ChatService["setParticipantTalkativeness"] {
  return async ({
    principal,
    chatId,
    characterId,
    talkativeness,
  }: SetParticipantTalkativenessParams) => {
    await requireHost(ctx, principal, chatId);
    const view = await updateCharacterParticipant(ctx, {
      chatId,
      characterId,
      ownerId: principal.userId,
      patch: { talkativeness },
    });
    await emit({ type: "chatUpdated", chatId });
    return view;
  };
}

// ── membership lifecycle (kick host-only; self-leave self) ─────────────────────

/** `kick` — host-only. Stamp `leftSeq` on the target's PRESENT row (atomic), emit `chatUpdated`, and deliver
 *  the durable `kicked` notification (the per-chat bus can't reach the now-removed member — Part III §3). The
 *  SSE stream teardown rides the kick tx in transport (PD-23). A no-present-row target is an idempotent no-op. */
function createKick(ctx: ChatContext, emit: EmitChatEvent): ChatService["kick"] {
  return async ({ principal, chatId, userId }: KickParticipantParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    const leftSeq = await loadMaxMessageSeq(ctx.db, chatId);
    const left = await markUserLeft(ctx.db, chatId, userId, leftSeq);
    if (left === undefined) {
      // Already gone / never a member — idempotent; nothing to emit or notify.
      return;
    }
    await emit({ type: "chatUpdated", chatId });
    await ctx.emitNotification({ type: "kicked", recipientUserId: userId, chatId });
  };
}

/** `selfLeave` — a member leaves their own membership (`leftSeq` stamped; authored rows retained, persona
 *  drops). A HOST self-leave has no successor (role `host` is singular), so it ARCHIVES the room — never
 *  refused (Part III §2: sole-host self-leave archives). Emits `chatUpdated`. */
function createSelfLeave(ctx: ChatContext, emit: EmitChatEvent): ChatService["selfLeave"] {
  return async ({ principal, chatId }: SelfLeaveParams): Promise<void> => {
    const { role } = await requireParticipant(ctx, principal, chatId);
    const at = ctx.now();
    const leftSeq = await loadMaxMessageSeq(ctx.db, chatId);
    await markUserLeft(ctx.db, chatId, principal.userId, leftSeq);
    if (role === "host") {
      await ctx.db.update(chats).set({ archived: true, updatedAt: at }).where(eq(chats.id, chatId));
    }
    await emit({ type: "chatUpdated", chatId });
  };
}
