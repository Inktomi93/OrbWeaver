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
import type { ChatBusEvent, GroupConfig, ParticipantView, RoomOverrides } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG, DEFAULT_ROOM_OVERRIDES, groupConfigSchema, isAiDriven, roomOverridesSchema, TALKATIVENESS_DEFAULT } from "@orb/contracts/chat";
import type { ChatDocumentVisibility } from "@orb/contracts/databank";
import { chatDocumentVisibilitySchema } from "@orb/contracts/databank";
import type { Principal } from "@orb/contracts/identity";
import type { ThemeBackground } from "@orb/contracts/theme";
import { backgroundMaterializeMessage, canonicalBackgroundSource, themeBackgroundSchema } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import { chatParticipants, chats } from "@orb/db";
import { batchMany } from "@orb/db/kit";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { AssetId, ChatId, ChatParticipantId, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq, isNull } from "drizzle-orm";
import type { ChatContext } from "../context";
import { CHAT_OP_CODES, ChatNotFoundError, ChatOperationError } from "../contract/errors";
import type {
  AcceptHostHandoffParams,
  AddCharacterToChatParams,
  GetGroupConfigForChatParams,
  GetRoomOverridesForChatParams,
  KickParticipantParams,
  NominateHostHandoffParams,
  RemoveCharacterFromChatParams,
  SelfLeaveParams,
  SetChatBackgroundParams,
  SetChatDocumentVisibilityParams,
  SetGroupConfigParams,
  SetMemberHistoryVisibilityParams,
  SetRoomOverridesParams,
  SetSeatKnobsParams,
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
} from "../persistence/participant";
import { loadMaxMessageSeq, loadPendingHostUserId } from "../persistence/queries";
import { loadRoster } from "../persistence/roster";
import { REMOVED_CHARACTER_LABEL } from "../substrate/participant-name";

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
  | "removeCharacterFromChat"
  | "setSeatKnobs"
  | "setGroupConfig"
  | "setRoomOverrides"
  | "setChatDocumentVisibility"
  | "setChatBackground"
  | "getGroupConfigForChat"
  | "getRoomOverridesForChat"
  | "kick"
  | "setMemberHistoryVisibility"
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
    setChatDocumentVisibility: createSetChatDocumentVisibility(ctx, emit),
    setChatBackground: createSetChatBackground(ctx, emit),
    getGroupConfigForChat: createGetGroupConfigForChat(ctx),
    getRoomOverridesForChat: createGetRoomOverridesForChat(ctx),
    addCharacterToChat: createAddCharacterToChat(ctx, emit),
    removeCharacterFromChat: createRemoveCharacterFromChat(ctx, emit),
    setSeatKnobs: createSetSeatKnobs(ctx, emit),
    kick: createKick(ctx, emit),
    setMemberHistoryVisibility: createSetMemberHistoryVisibility(ctx, emit),
    selfLeave: createSelfLeave(ctx, emit),
    nominateHostHandoff: createNominateHostHandoff(ctx, emit),
    acceptHostHandoff: createAcceptHostHandoff(ctx, emit),
  };
}

/** Maps a resolved chat_participants row to the ParticipantView read-model for a character participant:
 *  displayName/avatarAssetId come from the live card, handle is null. A null card (gone mid-delete)
 *  degrades the name to the removed-character label (never "", never the raw id). */
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
    displayName: card?.name ?? REMOVED_CHARACTER_LABEL,
    handle: null,
    avatarAssetId,
    avatarHash: await resolveAssetHash(avatarAssetId),
  };
}

/** `setGroupConfig` — host-only. Parses the lenient GroupConfigInput into a fully-defaulted GroupConfig,
 *  merges into chatMetadata.group, persists, emits chatUpdated. SEALS the agent-GM narrator+merged invariant
 *  (F5, below). */
function createSetGroupConfig(ctx: ChatContext, emit: EmitChatEvent): ChatService["setGroupConfig"] {
  return async ({ principal, chatId, config }: SetGroupConfigParams) => {
    const { chat } = await requireHost(ctx, principal, chatId);
    const parsed = groupConfigSchema.parse(config);
    // SEAL (D60 AP4a, agent-principal-design/05 §2 — F5): a GAME chat whose GM seat is AGENT-held may not be
    // flipped OFF narrator+merged (to `per-speaker`). narrator+merged keeps the GM tool loop on the narrator
    // turn; per-speaker would let a player-CHARACTER turn carry GM-authority tools at an agent-GM table. This
    // makes the previously config-COUPLED invariant STRUCTURAL — the honest path is unseat-then-flip (assign the
    // GM seat back to the AI narrator first, which re-sets narrator config). Chat stays rpg-table-blind: the seat
    // KIND comes from the injected `ctx.rpg.resolveGmSeatHolderKind` op (null when rpg unwired / not a game / NULL
    // AI seat / a human holds it — none of which lock the flip).
    if (parsed.output !== "narrator") {
      const holder = (await ctx.rpg?.resolveGmSeatHolderKind(chatId)) ?? null;
      if (holder?.kind === "agent") {
        throw new ChatOperationError(
          CHAT_OP_CODES.agentGmSeatConfigLocked,
          `chat ${chatId}: cannot switch this game to per-speaker output while an agent holds the GM seat — return the GM seat to the AI narrator first`,
        );
      }
    }
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
function createSetRoomOverrides(ctx: ChatContext, emit: EmitChatEvent): ChatService["setRoomOverrides"] {
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

/** `setChatDocumentVisibility` — host-only. Writes the per-document databank retrieval-visibility override
 *  (D85) into `chatMetadata.databankVisibility`. Set-semantics: `hidden` REPLACES the whole excluded set
 *  (a merge patch would strand a re-shown document as still-hidden). Validated at the trust boundary via the
 *  databank schema (documentId-typed ids; a malformed list is a `forbiddenOverride`, not a silent write).
 *  The write MERGES into the sibling sub-blobs (`...chat.metadata`) so a visibility write never nukes
 *  roomOverrides/group. The audit logs only the hidden-id COUNT — never document names/ids (a log row must
 *  not become a databank membership oracle). */
function createSetChatDocumentVisibility(ctx: ChatContext, emit: EmitChatEvent): ChatService["setChatDocumentVisibility"] {
  return async ({ principal, chatId, visibility }: SetChatDocumentVisibilityParams): Promise<ChatDocumentVisibility> => {
    const { chat } = await requireHost(ctx, principal, chatId);
    const parsed = chatDocumentVisibilitySchema.safeParse(visibility);
    if (!parsed.success) {
      throw new ChatOperationError(CHAT_OP_CODES.forbiddenOverride, `chat ${chatId}: databank visibility accepts only a { hidden: DocumentId[] } set`);
    }
    // Bind the merged blob to a variable (not a fresh literal in `.set()`) — the sibling sub-blobs ride the
    // spread and the freshness excess-property check never fires on the new key.
    const nextMetadata = { ...chat.metadata, databankVisibility: parsed.data };
    await ctx.db.update(chats).set({ metadata: nextMetadata, updatedAt: ctx.now() }).where(eq(chats.id, chatId));
    await emit({ type: "chatUpdated", chatId });
    await ctx.audit(
      {
        actorUserId: principal.userId,
        action: "chat.setChatDocumentVisibility",
        entityType: "chat",
        entityId: chatId,
        metadata: { hiddenCount: parsed.data.hidden.length },
      },
      ctx.now(),
    );
    return parsed.data;
  };
}

/** Convert a `kind:"external"` background source into an owned `kind:"asset"` one (BG-C invariant, F-P0-2):
 *  fetch → magic-belt → CAS-store the pasted URL, keeping the original URL as `provenanceUrl`. A blank URL is
 *  a no-op clear (⇒ `kind:"none"`). Any non-external source passes through untouched. A materialize refusal
 *  throws a leak-free coded error (the honest reason, never the URL). */
async function materializeExternal(ctx: ChatContext, principal: Principal, source: ThemeBackground): Promise<ThemeBackground> {
  if (source.kind !== "external") {
    return source;
  }
  const url = source.externalUrl.trim();
  if (url.length === 0) {
    return { ...source, kind: "none" };
  }
  const result = await ctx.materializeBackground(principal, url);
  if (!result.ok) {
    throw new ChatOperationError(CHAT_OP_CODES.backgroundUnavailable, backgroundMaterializeMessage(result.reason));
  }
  return {
    kind: "asset",
    seededId: "",
    externalUrl: "",
    provenanceUrl: url,
    assetId: result.asset.assetId,
    assetHash: result.asset.assetHash,
    mime: result.asset.mime,
  };
}

/** `setChatBackground` — host-only. Writes the per-chat carried BACKGROUND source (BG-C) into
 *  `chatMetadata.background`. Replaces the whole blob (`kind:"none"` clears it). Validated at the trust
 *  boundary via the theme schema. For the `asset` kind the referenced asset MUST be the host's own (a foreign
 *  assetId would GC-root someone else's private blob through this chat's metadata) — `filterOwnedAssetIds`
 *  is the gate; a non-owned/absent asset is a `forbiddenOverride`. The write MERGES into the sibling
 *  sub-blobs (`...chat.metadata`) so it never nukes roomOverrides/group. The audit logs only the source KIND
 *  — never the url/hash (a background can be card-body-like text). */
function createSetChatBackground(ctx: ChatContext, emit: EmitChatEvent): ChatService["setChatBackground"] {
  return async ({ principal, chatId, background }: SetChatBackgroundParams): Promise<ThemeBackground> => {
    const { chat } = await requireHost(ctx, principal, chatId);
    const parsed = themeBackgroundSchema.safeParse(background);
    if (!parsed.success) {
      throw new ChatOperationError(CHAT_OP_CODES.forbiddenOverride, `chat ${chatId}: invalid background source`);
    }
    // BG-C invariant (F-P0-2): a `kind:"external"` source can never paint (CSP), so materialize it server-side
    // into an owned `kind:"asset"` source (original URL kept as provenance) BEFORE persisting — or refuse. A
    // blank external URL is a no-op clear (⇒ `kind:"none"`), never a fetch of "".
    const resolved = await materializeExternal(ctx, principal, parsed.data);
    // Canonicalize FIRST: a non-asset kind carries NO asset ref, so a `kind:"none"` payload with a populated
    // `assetId` (the smuggle) is emptied here and can never GC-root through the metadata JSON live-source. The
    // ownership gate then runs whenever an asset ref SURVIVES (⇒ `kind:"asset"`) — belt-and-suspenders keyed on
    // `assetId` presence, not the kind literal — since a foreign asset would GC-root someone else's private blob.
    const source = canonicalBackgroundSource(resolved);
    if (source.assetId.length > 0) {
      const owned = await ctx.filterOwnedAssetIds(principal.userId, [castId<AssetId>(source.assetId)]);
      if (owned.length === 0) {
        throw new ChatOperationError(CHAT_OP_CODES.forbiddenOverride, `chat ${chatId}: an asset background must reference an asset you own`);
      }
    }
    // Bind the merged blob to a variable (not a fresh literal in `.set()`) — the sibling sub-blobs ride the
    // spread and the freshness excess-property check never fires on the new key (the databankVisibility precedent).
    const nextMetadata = { ...chat.metadata, background: source };
    await ctx.db.update(chats).set({ metadata: nextMetadata, updatedAt: ctx.now() }).where(eq(chats.id, chatId));
    await emit({ type: "chatUpdated", chatId });
    await ctx.audit(
      {
        actorUserId: principal.userId,
        action: "chat.setChatBackground",
        entityType: "chat",
        entityId: chatId,
        metadata: { kind: source.kind },
      },
      ctx.now(),
    );
    return source;
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
 *  row at the current canon head, emits chatUpdated, returns the resolved roster row. IDEMPOTENT: a character
 *  that already holds a PRESENT seat returns that seat's view unchanged — the character half of the roster has
 *  no `(chatId, userId)` unique (SQLite ignores the NULL userId), so this present-seat check is the ONLY server
 *  floor against a double-add (two present rows → double arbitration weight + multi-row knob updates). It is the
 *  floor RP1's `applyToChat` re-apply idempotency stands on (saved-rosters §7). Matches the `seatAgent`/`kick`
 *  idempotent idiom — a re-add is a no-op, never a coded refusal. */
function createAddCharacterToChat(ctx: ChatContext, emit: EmitChatEvent): ChatService["addCharacterToChat"] {
  return async ({ principal, chatId, characterId }: AddCharacterToChatParams) => {
    await requireHost(ctx, principal, chatId);
    // The character must be the host's (owner-scoped read — foreign == missing, leak-free). A roster
    // character is always host-owned, keeping the stats rebuild's ownerId attribution consistent.
    const card = await ctx.getCard({ ownerId: principal.userId, characterId });
    if (card === null) {
      throw new DomainNotFoundError("character", characterId);
    }
    // Present-seat floor: return the live seat instead of minting a duplicate row. `loadRoster` is present-only
    // (`leftSeq IS NULL`), so a previously-left character re-adds a fresh row (era-per-row, F8) as before.
    const existing = (await loadRoster(ctx.db, chatId)).find((p) => p.kind === "character" && p.characterId === characterId);
    if (existing !== undefined) {
      return characterParticipantView(existing, card, ctx.resolveAssetHash);
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
        // Mirrors the column default the insert above left unset (a character seat is never history-clamped).
        joinHistoryVisibility: "full",
      },
      card,
      ctx.resolveAssetHash,
    );
  };
}

/** `removeCharacterFromChat` — host-only; the symmetric drop for `addCharacterToChat`. leftSeq-stamps the
 *  present character seat at the current canon head through the ONE by-id stamp home (`markParticipantLeftStatement`
 *  — the same stamp the host-handoff character-drop uses), then emits chatUpdated. IDEMPOTENT: an absent or
 *  already-left character is a no-op (the `kick`/`addCharacterToChat` idiom — never a coded refusal). leftSeq is
 *  the WITNESSING boundary (D55): from the stamp the pruned character stops witnessing this chat's canon — the
 *  intended semantic for a cast member peeled out of a scene fork (a doorway for the parked rpg-design's
 *  scene-cast prune, `rpg-design/07 §2.2`, not a live consumer today). */
function createRemoveCharacterFromChat(ctx: ChatContext, emit: EmitChatEvent): ChatService["removeCharacterFromChat"] {
  return async ({ principal, chatId, characterId }: RemoveCharacterFromChatParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    // Present-only roster (`leftSeq IS NULL`); an already-left / never-present character has no seat → no-op.
    const seat = (await loadRoster(ctx.db, chatId)).find((p) => p.kind === "character" && p.characterId === characterId);
    if (seat === undefined) {
      return;
    }
    const leftSeq = await loadMaxMessageSeq(ctx.db, chatId);
    await markParticipantLeftStatement(ctx.db, seat.id, leftSeq);
    await emit({ type: "chatUpdated", chatId });
  };
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
  const targetRow = and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, targetUserId), isNull(chatParticipants.leftSeq));
  // Read the prior value first: the bus event carries `from`, the pre-switch persona a client reducer diffs against.
  const before = await db.select({ activePersonaId: chatParticipants.activePersonaId }).from(chatParticipants).where(targetRow).limit(1);
  const prior = before.at(0);
  if (prior === undefined) {
    throw new ChatOperationError(CHAT_OP_CODES.participantNotFound, `chat ${chatId}: user ${targetUserId} is not a present participant`);
  }
  await db.update(chatParticipants).set({ activePersonaId: personaId }).where(targetRow);
  await emit({ type: "personaSwitched", chatId, from: prior.activePersonaId, to: personaId });
}

/** `setSeatKnobs` — host-only; the ONE participantId-keyed AI-seat knob write (D80). Resolves a PRESENT
 *  AI-driven seat (`character` today; `agent` grafts back on per PD-17) by its `participantId` (the roster is
 *  present-only, so a left/absent seat is a miss), applies whichever of `talkativeness`/`disabled` the patch
 *  carries, emits chatUpdated, and returns the kind-appropriate resolved view. Replaces the retired per-kind
 *  forking — one home, so no arm can be skipped again when the agent kind returns. A non-AI-driven seat (a
 *  human seat, or the not-yet-rebuilt observer kind) carries no arbitration knobs → `participant_not_found`
 *  (host-only surface: the caller already sees the roster, so a coded refusal leaks nothing). An empty patch
 *  is a no-op that still returns the current view (idempotent — `applyToChat` re-apply leans on this). */
/** Resolve a mutated seat row to its ParticipantView by kind — today only `character` (via its live card,
 *  under the host's ownership; a null card degrades to the removed-character label); the `agent` arm (via its
 *  soul name) grafts back on with PD-17. */
async function seatViewFor(ctx: ChatContext, ownerId: UserId, row: typeof chatParticipants.$inferSelect): Promise<ParticipantView> {
  const card = row.characterId !== null ? await ctx.getCard({ ownerId, characterId: row.characterId }) : null;
  return characterParticipantView(row, card, ctx.resolveAssetHash);
}

/** Narrow a SeatKnobs patch to the columns it actually names (both optional). */
function seatKnobsSet(patch: SetSeatKnobsParams["patch"]): { talkativeness?: number; disabled?: boolean } {
  const set: { talkativeness?: number; disabled?: boolean } = {};
  if (patch.talkativeness !== undefined) {
    set.talkativeness = patch.talkativeness;
  }
  if (patch.disabled !== undefined) {
    set.disabled = patch.disabled;
  }
  return set;
}

function createSetSeatKnobs(ctx: ChatContext, emit: EmitChatEvent): ChatService["setSeatKnobs"] {
  return async ({ principal, chatId, participantId, patch }: SetSeatKnobsParams) => {
    await requireHost(ctx, principal, chatId);
    const seat = (await loadRoster(ctx.db, chatId)).find((p) => p.id === participantId);
    if (seat === undefined || !isAiDriven(seat.kind)) {
      throw new ChatOperationError(CHAT_OP_CODES.participantNotFound, `chat ${chatId}: ${participantId} is not a present AI seat`);
    }
    // An empty patch skips the UPDATE (idempotent no-op returning the current view — applyToChat re-apply leans on this).
    const set = seatKnobsSet(patch);
    let row = seat;
    if (Object.keys(set).length > 0) {
      const rows = await ctx.db
        .update(chatParticipants)
        .set(set)
        .where(and(eq(chatParticipants.id, participantId), isNull(chatParticipants.leftSeq)))
        .returning();
      row = rows.at(0) ?? seat;
    }
    await emit({ type: "chatUpdated", chatId });
    return seatViewFor(ctx, principal.userId, row);
  };
}

/** `kick` — host-only. Stamps leftSeq on the target's present row. For a HUMAN it delivers the durable
 *  `kicked` notification in the SAME batch — a crash can't remove the member without the notification, or
 *  vice versa. For an AGENT seat it stamps leftSeq DIRECTLY: an agent principal is sessionless and has no
 *  inbox (D60, doc 06 §3/§4), so `notifications.record` refuses an agent recipient — coupling the unseat to
 *  a `kicked` notification would abort the whole unseat. kick stays the multi-human members-list agent
 *  containment path (doc 03 §5): userId-keyed, its agent branch shares the ONE stamp (`stampAgentUnseat`)
 *  with the symmetric `unseatAgent` verb — identical row state either way. A non-present target (or a
 *  characterId-only seat, which carries no userId) is an idempotent no-op. */
function createKick(ctx: ChatContext, emit: EmitChatEvent): ChatService["kick"] {
  return async ({ principal, chatId, userId }: KickParticipantParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    const target = (await loadRoster(ctx.db, chatId)).find((p) => p.userId === userId);
    if (target === undefined) {
      return;
    }
    const leftSeq = await loadMaxMessageSeq(ctx.db, chatId);
    const leaveStatement = markUserLeftStatement(ctx.db, chatId, userId, leftSeq);
    await ctx.emitNotification({ type: "kicked", recipientUserId: userId, chatId }, [leaveStatement]);
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

/** `setMemberHistoryVisibility` — host-only; the ONE write path for the D16 per-participant join-history
 *  policy (`chat_participants.joinHistoryVisibility`). The column is the ONLY input to
 *  `substrate/auth::resolveHistoryFloorSeq`, which `requireParticipant` stamps onto every membership — so
 *  flipping it here re-clamps the target's history reads, replay, live stream, and forks on their very next
 *  call, with no other wiring. Keyed by `userId` like `kick`/`nominateHostHandoff`: a character seat carries
 *  a NULL userId (and has no reader floor — its `joinSeq`/`leftSeq` are the WITNESSING interval, a different
 *  axis), so it is unreachable through this key; the `kind === "human"` predicate makes that structural
 *  rather than incidental. A non-present / non-human target is a leak-free NOT_FOUND (the host already sees
 *  the roster, so a coded refusal leaks nothing — the `setSeatKnobs` idiom). Setting the value the row
 *  already carries skips the UPDATE (idempotent). Never touches `joinSeq`: `from-join` restricts what the
 *  member may read FROM THE JOIN POINT THEY ALREADY HAVE, it does not re-stamp their join. */
function createSetMemberHistoryVisibility(ctx: ChatContext, emit: EmitChatEvent): ChatService["setMemberHistoryVisibility"] {
  return async ({ principal, chatId, userId, visibility }: SetMemberHistoryVisibilityParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    const target = (await loadRoster(ctx.db, chatId)).find((p) => p.kind === "human" && p.userId === userId);
    if (target === undefined) {
      throw new ChatOperationError(CHAT_OP_CODES.participantNotFound, `chat ${chatId}: ${userId} is not a present human member`);
    }
    if (target.joinHistoryVisibility !== visibility) {
      await ctx.db
        .update(chatParticipants)
        .set({ joinHistoryVisibility: visibility })
        .where(and(eq(chatParticipants.id, target.id), isNull(chatParticipants.leftSeq)));
    }
    await emit({ type: "chatUpdated", chatId });
    await ctx.audit(
      {
        actorUserId: principal.userId,
        action: "chat.setMemberHistoryVisibility",
        entityType: "chat",
        entityId: chatId,
        metadata: { targetUserId: userId, visibility },
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
 *  blank name. Rather than refuse the transfer, drops those seats. Human seats are never dropped.
 *  Returns the present character participant ids to leftSeq-stamp. */
async function resolveDroppedCharacterSeatIds(
  ctx: ChatContext,
  newOwnerUserId: UserId,
  roster: readonly (typeof chatParticipants.$inferSelect)[],
): Promise<ChatParticipantId[]> {
  const characterSeats = roster.flatMap((p) =>
    p.kind === "character" && p.characterId !== null && p.leftSeq === null ? [{ id: p.id, characterId: p.characterId }] : [],
  );
  const cards = await Promise.all(characterSeats.map((s) => ctx.getCard({ ownerId: newOwnerUserId, characterId: s.characterId })));
  return characterSeats.flatMap((s, i) => (cards[i] === null ? [s.id] : []));
}

/** `nominateHostHandoff` — host-only, step 1. Persists the pending nominee, emits chatUpdated, and notifies
 *  the nominee. The nominee must be a present non-host member — otherwise a leak-free NOT_FOUND. No role
 *  swap happens here; only the nominee's accept promotes. */
function createNominateHostHandoff(ctx: ChatContext, emit: EmitChatEvent): ChatService["nominateHostHandoff"] {
  return async ({ principal, chatId, userId }: NominateHostHandoffParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    const roster = await loadRoster(ctx.db, chatId);
    const nominee = roster.find((p) => p.userId === userId);
    if (nominee === undefined || nominee.role === "host") {
      throw new ChatNotFoundError(chatId);
    }
    await ctx.emitNotification({ type: "handoff-nominated", recipientUserId: userId, chatId }, [setPendingHostStatement(ctx.db, chatId, userId, ctx.now())]);
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
function createAcceptHostHandoff(ctx: ChatContext, emit: EmitChatEvent): ChatService["acceptHostHandoff"] {
  return async ({ principal, chatId }: AcceptHostHandoffParams): Promise<void> => {
    await requireParticipant(ctx, principal, chatId);
    const pending = await loadPendingHostUserId(ctx.db, chatId);
    if (pending === null || pending !== principal.userId) {
      throw new ChatOperationError(CHAT_OP_CODES.notTurnOwner, `chat ${chatId}: only the nominated member may accept the host handoff`);
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
    if (oldHost?.userId !== undefined && oldHost.userId !== null && oldHost.userId !== principal.userId) {
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
