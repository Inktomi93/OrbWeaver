// The roster/group-config/room-override/membership-lifecycle mutation verbs. Each verb is a factory
// createX(ctx, emit): gates via the membership chokepoint, mutates via persistence, then emits the
// room-public bus event (+ a notifications op where the design reaches a non-member). Group-ness is data:
// no if(isGroup) — solo is a roster-of-1, byte-identical.
//
// The ChatBusEvent union has no dedicated roster/membership member, so every roster/group/override/
// membership mutation emits the chatUpdated catch-all (a "refetch the chat detail" signal).
//
// Host handoff is a two-party flow: the pending nomination is persisted on chats.pendingHostUserId, carried
// between nominateHostHandoff (host-only) and acceptHostHandoff (the nominee's un-spoofable self-action —
// principal.userId === chats.pendingHostUserId). A non-eligible nominee is a leak-free NOT_FOUND; a
// non-nominee accept is refused with not_turn_owner.

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
import type { Db } from "@orb/db";
import { chatParticipants, chats } from "@orb/db";
import { batchMany } from "@orb/db/kit";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, ChatId, ChatParticipantId, PersonaId, UserId } from "@orb/kit/ids";
import { and, eq, isNull } from "drizzle-orm";
import type { ChatContext } from "../contract/context";
import { CHAT_OP_CODES, ChatNotFoundError, ChatOperationError } from "../contract/errors";
import type {
  AcceptHostHandoffParams,
  AddCharacterToChatParams,
  GetGroupConfigForChatParams,
  GetRoomOverridesForChatParams,
  KickParticipantParams,
  NominateHostHandoffParams,
  SeatAgentParams,
  SelfLeaveParams,
  SetGroupConfigParams,
  SetParticipantDisabledParams,
  SetParticipantTalkativenessParams,
  SetRoomOverridesParams,
} from "../contract/params";
import type { ChatService } from "../contract/service";
import { requireHost, requireParticipant } from "../guard";
import {
  acceptHostHandoffSwapStatements,
  assertForcedCharacterMember,
  insertParticipants,
  markParticipantLeftStatement,
  markUserLeft,
  markUserLeftStatement,
  setPendingHostStatement,
  upsertAgentSeat,
} from "../persistence/participant";
import { loadMaxMessageSeq, loadPendingHostUserId } from "../persistence/queries";
import { loadRoster } from "../persistence/roster";

/** The emit op the mutating roster verbs close over. */
type EmitChatEvent = (event: ChatBusEvent) => Promise<void>;

/** The extra collaborators the roster bundle needs beyond `ChatContext`. */
interface RosterDeps {
  readonly emit: EmitChatEvent;
}

/** The roster slice of `ChatService` this grouped file owns. */
type RosterVerbs = Pick<
  ChatService,
  | "addCharacterToChat"
  | "seatAgent"
  | "setParticipantDisabled"
  | "setParticipantTalkativeness"
  | "setGroupConfig"
  | "setRoomOverrides"
  | "getGroupConfigForChat"
  | "getRoomOverridesForChat"
  | "kick"
  | "selfLeave"
  | "nominateHostHandoff"
  | "acceptHostHandoff"
>;

/** The roster/group/override/membership-lifecycle verb bundle the composition root spreads into the full service. */
export function createRoster(ctx: ChatContext, deps: RosterDeps): RosterVerbs {
  const { emit } = deps;
  return {
    setGroupConfig: createSetGroupConfig(ctx, emit),
    setRoomOverrides: createSetRoomOverrides(ctx, emit),
    getGroupConfigForChat: createGetGroupConfigForChat(ctx),
    getRoomOverridesForChat: createGetRoomOverridesForChat(ctx),
    addCharacterToChat: createAddCharacterToChat(ctx, emit),
    seatAgent: createSeatAgent(ctx, emit),
    setParticipantDisabled: createSetParticipantDisabled(ctx, emit),
    setParticipantTalkativeness: createSetParticipantTalkativeness(ctx, emit),
    kick: createKick(ctx, emit),
    selfLeave: createSelfLeave(ctx, emit),
    nominateHostHandoff: createNominateHostHandoff(ctx, emit),
    acceptHostHandoff: createAcceptHostHandoff(ctx, emit),
  };
}

/** Maps a resolved chat_participants row to the ParticipantView read-model for a character participant:
 *  displayName/avatarAssetId come from the live card, handle is null. A null card (gone mid-delete)
 *  degrades the name to "" — never an error. */
async function characterParticipantView(
  row: typeof chatParticipants.$inferSelect,
  card: CharacterCard | null,
  resolveAssetHash: ChatContext["resolveAssetHash"],
): Promise<ParticipantView> {
  const avatarAssetId = card?.avatarAssetId ?? null;
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
    avatarAssetId,
    avatarHash: await resolveAssetHash(avatarAssetId),
  };
}

/** `setGroupConfig` — host-only. Parses the lenient GroupConfigInput into a fully-defaulted GroupConfig,
 *  merges into chatMetadata.group, persists, emits chatUpdated. */
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
    await ctx.audit(
      {
        actorUserId: principal.userId,
        action: "chat.setGroupConfig",
        entityType: "chat",
        entityId: chatId,
        metadata: { output: parsed.output, policy: parsed.policy },
      },
      ctx.now(),
    );
    return parsed;
  };
}

/** `setRoomOverrides` — host-only. The four-field allowlist default-denies a stray field. */
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
    // Field labels only, never the override bodies (card-body-like text must not leak into a log row).
    await ctx.audit(
      {
        actorUserId: principal.userId,
        action: "chat.setRoomOverrides",
        entityType: "chat",
        entityId: chatId,
        metadata: { fields: Object.keys(parsed.data) },
      },
      ctx.now(),
    );
    return parsed.data;
  };
}

/** `getGroupConfigForChat` — member. The effective GroupConfig (parsed sub-blob or the canonical default). */
function createGetGroupConfigForChat(ctx: ChatContext): ChatService["getGroupConfigForChat"] {
  return async ({ principal, chatId }: GetGroupConfigForChatParams): Promise<GroupConfig> => {
    const { chat } = await requireParticipant(ctx, principal, chatId);
    return chat.metadata.group ?? DEFAULT_GROUP_CONFIG;
  };
}

/** `getRoomOverridesForChat` — member. The effective RoomOverrides (parsed sub-blob or the empty default). */
function createGetRoomOverridesForChat(ctx: ChatContext): ChatService["getRoomOverridesForChat"] {
  return async ({ principal, chatId }: GetRoomOverridesForChatParams): Promise<RoomOverrides> => {
    const { chat } = await requireParticipant(ctx, principal, chatId);
    return chat.metadata.roomOverrides ?? DEFAULT_ROOM_OVERRIDES;
  };
}

/** `addCharacterToChat` — host-only; the character participant-insert chokepoint. Stamps a fresh member
 *  row at the current canon head, emits chatUpdated, returns the resolved roster row. */
function createAddCharacterToChat(
  ctx: ChatContext,
  emit: EmitChatEvent,
): ChatService["addCharacterToChat"] {
  return async ({ principal, chatId, characterId }: AddCharacterToChatParams) => {
    await requireHost(ctx, principal, chatId);
    // The character must be the host's (owner-scoped read — foreign == missing, leak-free). A roster
    // character is always host-owned, keeping the stats rebuild's ownerId attribution consistent.
    const card = await ctx.getCard({ ownerId: principal.userId, characterId });
    if (card === null) {
      throw new DomainNotFoundError("character", characterId);
    }
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
      ctx.resolveAssetHash,
    );
  };
}

/** Maps a resolved agent chat_participants row to ParticipantView. An agent seat FKs users, carries no
 *  character; the client renders the room-facing identity via AgentCardView, not this row. */
function agentParticipantView(row: typeof chatParticipants.$inferSelect): ParticipantView {
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
    displayName: "",
    handle: null,
    avatarAssetId: null,
    avatarHash: null,
  };
}

/** `seatAgent` — host-gated; the agent-seat insert path. The host consents to the seat; the owner (whose
 *  agent) must be a present human member. The principal is lazily minted, refused if disabled, then seated
 *  via the re-join upsert. Emits chatUpdated. Unseating is the normal kick path. */
function createSeatAgent(ctx: ChatContext, emit: EmitChatEvent): ChatService["seatAgent"] {
  return async ({ principal, chatId, ownerUserId, sourceKind }: SeatAgentParams) => {
    await requireHost(ctx, principal, chatId);
    const roster = await loadRoster(ctx.db, chatId);
    const ownerPresent = roster.some((p) => p.kind === "human" && p.userId === ownerUserId);
    if (!ownerPresent) {
      throw new ChatOperationError(
        CHAT_OP_CODES.ownerNotPresent,
        `chat ${chatId}: the agent's owner is not a present member`,
      );
    }
    const { agentUserId } = await ctx.provisionAgentPrincipal({ ownerUserId, sourceKind });
    if (!(await ctx.resolveAgentEnabled(agentUserId))) {
      throw new ChatOperationError(
        CHAT_OP_CODES.agentDisabled,
        `chat ${chatId}: agent principal ${agentUserId} is disabled`,
      );
    }
    const at = ctx.now();
    const joinSeq = await loadMaxMessageSeq(ctx.db, chatId);
    const row = await upsertAgentSeat(ctx.db, {
      participantId: ctx.newParticipantId(),
      chatId,
      agentUserId,
      joinSeq,
      now: at,
    });
    await emit({ type: "chatUpdated", chatId });
    // An undefined upsert means the agent was already present; a miss in the roster loaded above is a real
    // inconsistency (fail loud, not a phantom branch).
    const seated = row ?? roster.find((p) => p.kind === "agent" && p.userId === agentUserId);
    if (seated === undefined) {
      throw new ChatNotFoundError(chatId);
    }
    return agentParticipantView(seated);
  };
}

/** Sets a single field on a present character participant (the disable/talkativeness shared write). A
 *  missing roster target is a coded participant_not_found refusal (the caller is already the verified host). */
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
    throw new ChatOperationError(
      CHAT_OP_CODES.participantNotFound,
      `chat ${chatId}: character ${characterId} is not a present participant`,
    );
  }
  const card = await ctx.getCard({ ownerId, characterId });
  return characterParticipantView(row, card, ctx.resolveAssetHash);
}

/** Flips a human participant's active persona for this room. Not a ChatService verb: persona owns the
 *  principal-facing surface and already cleared its own gate before calling this — the chat-domain write +
 *  emit chokepoint. Takes a minimal db + injected emit since persona composes before chat at the entry root.
 *  A miss (target not present) is a real caller error, never a silent no-op. Emits personaSwitched. */
export async function setParticipantActivePersona(
  db: Db,
  emit: EmitChatEvent,
  params: {
    readonly chatId: ChatId;
    readonly targetUserId: UserId;
    readonly personaId: PersonaId | null;
  },
): Promise<void> {
  const { chatId, targetUserId, personaId } = params;
  const targetRow = and(
    eq(chatParticipants.chatId, chatId),
    eq(chatParticipants.userId, targetUserId),
    isNull(chatParticipants.leftSeq),
  );
  // Read the prior value first: the bus event carries `from`, the pre-switch persona a client reducer diffs against.
  const before = await db
    .select({ activePersonaId: chatParticipants.activePersonaId })
    .from(chatParticipants)
    .where(targetRow)
    .limit(1);
  const prior = before.at(0);
  if (prior === undefined) {
    throw new ChatOperationError(
      CHAT_OP_CODES.participantNotFound,
      `chat ${chatId}: user ${targetUserId} is not a present participant`,
    );
  }
  await db.update(chatParticipants).set({ activePersonaId: personaId }).where(targetRow);
  await emit({ type: "personaSwitched", chatId, from: prior.activePersonaId, to: personaId });
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

/** `kick` — host-only. Stamps leftSeq on the target's present row + delivers the durable kicked
 *  notification in one batch — a crash can't remove the member without the notification, or vice versa.
 *  A non-present target is an idempotent no-op. */
function createKick(ctx: ChatContext, emit: EmitChatEvent): ChatService["kick"] {
  return async ({ principal, chatId, userId }: KickParticipantParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    const present = (await loadRoster(ctx.db, chatId)).some((p) => p.userId === userId);
    if (!present) {
      return;
    }
    const leftSeq = await loadMaxMessageSeq(ctx.db, chatId);
    await ctx.emitNotification({ type: "kicked", recipientUserId: userId, chatId }, [
      markUserLeftStatement(ctx.db, chatId, userId, leftSeq),
    ]);
    await emit({ type: "chatUpdated", chatId });
    // The kicked user's row is already leftSeq-stamped (no longer enumerated), so they ride extraUserIds.
    await ctx.emitChatChanged(chatId, { detail: true, extraUserIds: [userId] });
    await ctx.audit(
      {
        actorUserId: principal.userId,
        action: "chat.kick",
        entityType: "chat",
        entityId: chatId,
        metadata: { targetUserId: userId },
      },
      ctx.now(),
    );
  };
}

/** `selfLeave` — a member leaves their own membership. A host self-leave has no successor, so it archives
 *  the room instead of being refused. Emits chatUpdated. */
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

/** The character seats a new room owner does not own — the seats a transfer must drop, since cards are
 *  single-owned and a character seat whose card resolves null under the new owner would collapse to a
 *  blank name. Rather than refuse the transfer, drops those seats. Human + agent seats are never dropped.
 *  Returns the present character participant ids to leftSeq-stamp. */
async function resolveDroppedCharacterSeatIds(
  ctx: ChatContext,
  newOwnerUserId: UserId,
  roster: readonly (typeof chatParticipants.$inferSelect)[],
): Promise<ChatParticipantId[]> {
  const characterSeats = roster.flatMap((p) =>
    p.kind === "character" && p.characterId !== null && p.leftSeq === null
      ? [{ id: p.id, characterId: p.characterId }]
      : [],
  );
  const cards = await Promise.all(
    characterSeats.map((s) => ctx.getCard({ ownerId: newOwnerUserId, characterId: s.characterId })),
  );
  return characterSeats.flatMap((s, i) => (cards[i] === null ? [s.id] : []));
}

/** `nominateHostHandoff` — host-only, step 1. Persists the pending nominee, emits chatUpdated, and notifies
 *  the nominee. The nominee must be a present non-host member — otherwise a leak-free NOT_FOUND. No role
 *  swap happens here; only the nominee's accept promotes. */
function createNominateHostHandoff(
  ctx: ChatContext,
  emit: EmitChatEvent,
): ChatService["nominateHostHandoff"] {
  return async ({ principal, chatId, userId }: NominateHostHandoffParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    const roster = await loadRoster(ctx.db, chatId);
    const nominee = roster.find((p) => p.userId === userId);
    if (nominee === undefined || nominee.role === "host") {
      throw new ChatNotFoundError(chatId);
    }
    await ctx.emitNotification({ type: "handoff-nominated", recipientUserId: userId, chatId }, [
      setPendingHostStatement(ctx.db, chatId, userId, ctx.now()),
    ]);
    await emit({ type: "chatUpdated", chatId });
    await ctx.audit(
      {
        actorUserId: principal.userId,
        action: "chat.nominateHostHandoff",
        entityType: "chat",
        entityId: chatId,
        metadata: { nomineeUserId: userId },
      },
      ctx.now(),
    );
  };
}

/** `acceptHostHandoff` — step 2: the nominee accepts (a self-action). The caller must equal
 *  chats.pendingHostUserId, else not_turn_owner. On pass, atomically swaps roles, drops the outgoing host's
 *  character seats the new host doesn't own, and clears the nomination in one batch; emits chatUpdated and
 *  notifies the previous host. */
function createAcceptHostHandoff(
  ctx: ChatContext,
  emit: EmitChatEvent,
): ChatService["acceptHostHandoff"] {
  return async ({ principal, chatId }: AcceptHostHandoffParams): Promise<void> => {
    await requireParticipant(ctx, principal, chatId);
    const pending = await loadPendingHostUserId(ctx.db, chatId);
    if (pending === null || pending !== principal.userId) {
      throw new ChatOperationError(
        CHAT_OP_CODES.notTurnOwner,
        `chat ${chatId}: only the nominated member may accept the host handoff`,
      );
    }
    // The previous host (for the post-swap notification) may be absent if they left after nominating.
    const roster = await loadRoster(ctx.db, chatId);
    const oldHost = roster.find((p) => p.role === "host" && p.userId !== null);
    const droppedSeatIds = await resolveDroppedCharacterSeatIds(ctx, principal.userId, roster);
    const dropSeq = await loadMaxMessageSeq(ctx.db, chatId);
    const swap = [
      ...acceptHostHandoffSwapStatements(ctx.db, {
        chatId,
        nomineeUserId: principal.userId,
        now: ctx.now(),
      }),
      ...droppedSeatIds.map((id) => markParticipantLeftStatement(ctx.db, id, dropSeq)),
    ];
    if (
      oldHost?.userId !== undefined &&
      oldHost.userId !== null &&
      oldHost.userId !== principal.userId
    ) {
      await ctx.emitNotification(
        {
          type: "handoff-accepted",
          recipientUserId: oldHost.userId,
          chatId,
          newHostHandle: principal.handle,
        },
        swap,
      );
    } else {
      await ctx.db.batch(batchMany(swap));
    }
    await emit({ type: "chatUpdated", chatId });
    await ctx.audit(
      {
        actorUserId: principal.userId,
        action: "chat.acceptHostHandoff",
        entityType: "chat",
        entityId: chatId,
        metadata: { previousHostUserId: oldHost?.userId ?? null },
      },
      ctx.now(),
    );
  };
}
