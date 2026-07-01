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
// FLAG[PD-87]: there is no `participant_not_found`/`target_not_member` code in `CHAT_OP_CODES`;
// the disable/talkativeness verbs map a missing roster target to `ChatNotFoundError` (→ NOT_FOUND) — the
// closest leak-free typed error. A dedicated code would tidy the message.
// HOST HANDOFF (PD-60 — Part III §2; the two-party "nominate → notify → nominee accepts" flow). The pending
// nomination is persisted on `chats.pendingHostUserId` (the schema seam this chunk added), carried between the
// two verbs so `acceptHostHandoff` can SECURELY verify the caller was nominated (no storage = a self-promotion
// hole — chunk 5's correct refusal to stub). `nominateHostHandoff` = host-only (`requireHost`); the nominee
// must be a PRESENT non-host member. `acceptHostHandoff` = the nominee's un-spoofable SELF-action
// (`requireParticipant` + `principal.userId === chats.pendingHostUserId` — a verb-level check on the nomination
// record, NOT a host check; chunk-3 matrix). Doc §2 is silent on two cases → security-conservative + FLAGGED:
//   • FLAG[handoff-nominee]: a nominee who is not a present non-host member (incl. a host self-nominating —
//     their row is `role='host'`, not a member) → `ChatNotFoundError` (NOT_FOUND), matching this file's
//     existing `participant-not-found` precedent. No `invalid_nominee` code exists + `contract/errors.ts` is
//     out of this chunk's scope (can't add one).
//   • FLAG[handoff-accept-code]: a non-nominee accept is refused with `CHAT_OP_CODES.not_turn_owner` — the
//     closest existing "you don't own this pending action" code (a dedicated `not_nominee` would be tidier,
//     but the code set is in `contract/errors.ts`, out of scope). This is the belt that keeps the
//     self-promotion hole CLOSED: only the exact nominee can accept.

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
  AcceptHostHandoffParams,
  AddCharacterToChatParams,
  GetGroupConfigForChatParams,
  GetRoomOverridesForChatParams,
  KickParticipantParams,
  NominateHostHandoffParams,
  SelfLeaveParams,
  SetGroupConfigParams,
  SetParticipantDisabledParams,
  SetParticipantTalkativenessParams,
  SetRoomOverridesParams,
} from "../contract/params";
import type { ChatService } from "../contract/service";
import { requireHost, requireParticipant } from "../guard";
import {
  acceptHostHandoffSwap,
  assertForcedCharacterMember,
  insertParticipants,
  markUserLeft,
  setPendingHost,
} from "../persistence/participant";
import { loadMaxMessageSeq, loadPendingHostUserId } from "../persistence/queries";
import { loadRoster } from "../persistence/roster";

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
  | "nominateHostHandoff"
  | "acceptHostHandoff"
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
    nominateHostHandoff: createNominateHostHandoff(ctx, emit),
    acceptHostHandoff: createAcceptHostHandoff(ctx, emit),
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

// ── host handoff (two-party: nominate host-only; accept = the nominee self-action — Part III §2) ─────────

/** `nominateHostHandoff` — host-only, step 1 (Part III §2). Persist the pending nominee on
 *  `chats.pendingHostUserId` (carried to the nominee's accept), emit `chatUpdated`, and notify the nominee
 *  ("you've been nominated as host"). The nominee MUST be a PRESENT non-host member — a non-member / a host
 *  self-nomination collapses to a leak-free `ChatNotFoundError` (FLAG[handoff-nominee], file header). No role
 *  swap happens here; only the nominee's accept promotes (the un-spoofable self-action). */
function createNominateHostHandoff(
  ctx: ChatContext,
  emit: EmitChatEvent,
): ChatService["nominateHostHandoff"] {
  return async ({ principal, chatId, userId }: NominateHostHandoffParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    const roster = await loadRoster(ctx.db, chatId);
    const nominee = roster.find((p) => p.userId === userId);
    if (nominee === undefined || nominee.role === "host") {
      // Not a present non-host member (a host self-nominating lands here — their row is role 'host').
      throw new ChatNotFoundError(chatId);
    }
    await setPendingHost(ctx.db, chatId, userId, ctx.now());
    await emit({ type: "chatUpdated", chatId });
    await ctx.emitNotification({ type: "handoff-nominated", recipientUserId: userId, chatId });
  };
}

/** `acceptHostHandoff` — step 2: the nominee accepts (a SELF-action — Part III §2). Gate present-membership
 *  (`requireParticipant`), then the verb-level self-action check: the caller MUST equal
 *  `chats.pendingHostUserId` (else `not_turn_owner` — FLAG[handoff-accept-code]; this is the belt that keeps
 *  the self-promotion hole closed). On pass, atomically swap roles (old host → member, caller → host) + clear
 *  the nomination, emit `chatUpdated`, and notify the previous host of the swap. */
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
    // The previous host (for the post-swap notification) — may be absent if they left after nominating.
    const roster = await loadRoster(ctx.db, chatId);
    const oldHost = roster.find((p) => p.role === "host" && p.userId !== null);
    await acceptHostHandoffSwap(ctx.db, {
      chatId,
      nomineeUserId: principal.userId,
      now: ctx.now(),
    });
    await emit({ type: "chatUpdated", chatId });
    if (
      oldHost?.userId !== undefined &&
      oldHost.userId !== null &&
      oldHost.userId !== principal.userId
    ) {
      await ctx.emitNotification({
        type: "handoff-accepted",
        recipientUserId: oldHost.userId,
        chatId,
        newHostHandle: principal.handle,
      });
    }
  };
}
