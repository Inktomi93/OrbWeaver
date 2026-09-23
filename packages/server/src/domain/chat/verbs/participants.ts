// domain/chat/verbs/participants — the participants/group-config/room-override/membership-lifecycle mutation
// verbs. Each verb is a factory createX(ctx, emit): gates via the membership chokepoint, mutates via
// persistence, then emits the room-public bus event (+ a notifications op where the design reaches a
// non-member). Group-ness is data: no if(isGroup) — solo is a room of one seat, byte-identical.
//
// The ChatBusEvent union has no dedicated participants/membership member, so every seat/group/override/
// membership mutation emits the chatUpdated catch-all (a "refetch the chat detail" signal).
//
// Host handoff is a two-party flow: the pending nomination is persisted on chats.pendingHostUserId, carried
// between nominateHostHandoff (host-only) and acceptHostHandoff (the nominee's un-spoofable self-action —
// principal.userId === chats.pendingHostUserId). A non-eligible nominee is a leak-free NOT_FOUND; a
// non-nominee accept is refused with not_turn_owner.

import type { CharacterCard } from "@orb/contracts/character";
import type { ChatMetadata, DurableChatBusEvent, GroupConfig, MessageView, ParticipantView, RoomOverrides } from "@orb/contracts/chat";
import {
  DEFAULT_GROUP_CONFIG,
  DEFAULT_ROOM_OVERRIDES,
  groupConfigSchema,
  handoffOfferSchema,
  isAiDriven,
  NO_HANDOFF_OFFER,
  roomOverridesSchema,
  TALKATIVENESS_DEFAULT,
} from "@orb/contracts/chat";
import type { ChatDocumentVisibility } from "@orb/contracts/databank";
import { chatDocumentVisibilitySchema } from "@orb/contracts/databank";
import type { Principal } from "@orb/contracts/identity";
import type { ThemeBackground } from "@orb/contracts/theme";
import { backgroundMaterializeMessage, canonicalBackgroundSource, themeBackgroundSchema } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import { chatParticipants, chats } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { AssetId, CharacterId, ChatId, ChatParticipantId, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq, isNull } from "drizzle-orm";
import type { ChatContext } from "../context.ts";
import type { ClaimChatOp, HandoffResumption } from "../contract/context.ts";
import { CHAT_OP_CODES, ChatNotFoundError, ChatOperationError } from "../contract/errors.ts";
import { TOOL_RECURSE_LIMIT_MAX, TOOL_RECURSE_LIMIT_MIN, toolRecurseLimitSchema } from "../contract/metadata.ts";
import type {
  AcceptHostHandoffParams,
  AddCharacterToChatParams,
  GetGroupConfigForChatParams,
  GetRoomOverridesForChatParams,
  KickParticipantParams,
  NominateHostHandoffParams,
  RemoveCharacterFromChatParams,
  SelfLeaveParams,
  SetCharactersCanReactParams,
  SetChatBackgroundParams,
  SetChatDocumentVisibilityParams,
  SetGroupConfigParams,
  SetHostDisplayScriptsParams,
  SetMemberHistoryVisibilityParams,
  SetOfferChoicesParams,
  SetReactionsEnabledParams,
  SetRegexAllowParams,
  SetRoomOverridesParams,
  SetSeatKnobsParams,
  SetToolRecurseLimitParams,
} from "../contract/params.ts";
import type { HostTierRegexAllow } from "../contract/regex.ts";
import type { ChatService } from "../contract/service.ts";
import { requireHost, requireParticipant } from "../guard.ts";
import { carriedBackgroundAvailable, ownedBackgroundAvailable } from "../persistence/background-write.ts";
import { restampChatCharacterStatement } from "../persistence/canon-write.ts";
import { chatMetadataSetStatement } from "../persistence/chat-metadata-write.ts";
import { clearHandoffResumptionStatement, insertHandoffResumptionStatement, loadHandoffResumption } from "../persistence/handoff-resume.ts";
import {
  acceptHostHandoffSwapStatements,
  assertForcedCharacterMember,
  classifyParticipant,
  insertParticipants,
  markParticipantLeftStatement,
  markUserLeft,
  markUserLeftStatement,
  repointCharacterSeatStatement,
  setPendingHostStatement,
} from "../persistence/participant.ts";
import { characterEverSeatedInChat, characterSeatedInAnotherChat, loadParticipants } from "../persistence/participants-read.ts";
import { loadHasUserMessage, loadMaxMessageSeq, loadPendingHandoff } from "../persistence/queries.ts";
import { buildGreetingSeed } from "../substrate/greeting-seed.ts";
import { previewHandoffCopyPlan, resolveHandoffCopyPlan } from "../substrate/handoff-copy.ts";
import { REMOVED_CHARACTER_LABEL } from "../substrate/participant-name.ts";
import { hostUserIdOf } from "../substrate/participants-host.ts";
import { regexAllowOf } from "../substrate/regex-tier.ts";
import { canonMessageDelta, seatChatDelta } from "../substrate/stats-delta.ts";

/** The emit op the mutating roster verbs close over. Production returns `false` only when the total bus
 * classified and dropped its durable append; direct verb tests historically return no value. */
type EmitChatEvent = (event: DurableChatBusEvent, claimStatement?: BatchStmt) => Promise<unknown>;

/** The extra collaborators the roster bundle needs beyond `ChatContext`. */
interface ParticipantDeps {
  readonly emit: EmitChatEvent;
  /** The husk→real transition (R0 SS4.2). Every MUTATING roster/config verb here claims the room
   *  BEFORE it writes -- tuning a room is 'doing something with it' (F4(a)), so it stops being an
   *  abandonable husk. The five membership-lifecycle verbs deliberately abstain (see the NAMES note in
   *  the factory bodies): a departure is not effort, and each needs a second human whose invite claimed
   *  the room already. Ordering is load-bearing -- claim AFTER the authority guard (a stranger must not
   *  be able to flip a room's visibility) and BEFORE the write (`verbs/claim-chat.ts`). */
  readonly claimChat: ClaimChatOp;
}

/** The roster slice of `ChatService` this grouped file owns. */
type ParticipantVerbs = Pick<
  ChatService,
  | "addCharacterToChat"
  | "removeCharacterFromChat"
  | "setSeatKnobs"
  | "setGroupConfig"
  | "setRoomOverrides"
  | "setChatDocumentVisibility"
  | "setChatBackground"
  | "setHostDisplayScripts"
  | "setRegexAllow"
  | "setOfferChoices"
  | "setCharactersCanReact"
  | "setReactionsEnabled"
  | "setToolRecurseLimit"
  | "getGroupConfigForChat"
  | "getRoomOverridesForChat"
  | "kick"
  | "setMemberHistoryVisibility"
  | "selfLeave"
  | "nominateHostHandoff"
  | "acceptHostHandoff"
>;

async function commitStatsFencedChatUpdate(ctx: ChatContext, ownerId: UserId, statement: BatchStmt): Promise<void> {
  const statements = [statement];
  ctx.bumpStatsCanonVersion(statements, ctx.db, ownerId);
  await ctx.db.batch(batchMany(statements));
}

/** Write ONE metadata key (#1450). The whole-blob read-modify-write this replaced made every host knob a
 *  lost-update race against every other one — see `persistence/chat-metadata-write.ts`. The availability guard
 *  is still computed from the EFFECTIVE metadata (the row's siblings plus this key's new value), because that
 *  is the background that will be in force after the write. */
async function commitMetadataUpdate<K extends keyof ChatMetadata>(args: {
  readonly ctx: ChatContext;
  readonly ownerId: UserId;
  readonly chatId: ChatId;
  readonly key: K;
  readonly value: NonNullable<ChatMetadata[K]>;
  /** The effective post-write metadata — read ONLY by the background-availability guard, never written. */
  readonly effective: ChatMetadata;
  readonly authority: "carried" | "owned";
}): Promise<void> {
  const { ctx, ownerId, chatId, effective, authority } = args;
  const available = authority === "owned" ? ownedBackgroundAvailable(ctx.db, ownerId, effective) : carriedBackgroundAvailable(ctx.db, effective);
  const statement = chatMetadataSetStatement(ctx.db, { chatId, key: args.key, value: args.value, guard: available, now: ctx.now() });
  const statements: BatchStmt[] = [statement];
  ctx.bumpStatsCanonVersion(statements, ctx.db, ownerId);
  const results = await ctx.db.batch(batchMany(statements));
  const updated = results[0] as readonly { readonly id: ChatId }[];
  if (updated.length === 0) {
    const stillExists = await ctx.db.select({ id: chats.id }).from(chats).where(eq(chats.id, chatId)).limit(1);
    if (stillExists.length === 0) {
      throw new ChatNotFoundError(chatId);
    }
    throw new ChatOperationError(CHAT_OP_CODES.backgroundUnavailable, `chat ${chatId}: the background asset is no longer available`);
  }
}

/** The roster/group/override/membership-lifecycle verb bundle the composition root spreads into the full service. */
export function createParticipants(ctx: ChatContext, deps: ParticipantDeps): ParticipantVerbs {
  const { emit, claimChat } = deps;
  return {
    setGroupConfig: createSetGroupConfig(ctx, emit, claimChat),
    setRoomOverrides: createSetRoomOverrides(ctx, emit, claimChat),
    setChatDocumentVisibility: createSetChatDocumentVisibility(ctx, emit, claimChat),
    setChatBackground: createSetChatBackground(ctx, emit, claimChat),
    setHostDisplayScripts: createSetHostDisplayScripts(ctx, emit, claimChat),
    setRegexAllow: createSetRegexAllow(ctx, emit, claimChat),
    setOfferChoices: createSetOfferChoices(ctx, emit, claimChat),
    setCharactersCanReact: createSetCharactersCanReact(ctx, emit, claimChat),
    setReactionsEnabled: createSetReactionsEnabled(ctx, emit, claimChat),
    setToolRecurseLimit: createSetToolRecurseLimit(ctx, emit, claimChat),
    getGroupConfigForChat: createGetGroupConfigForChat(ctx),
    getRoomOverridesForChat: createGetRoomOverridesForChat(ctx),
    addCharacterToChat: createAddCharacterToChat(ctx, emit, claimChat),
    removeCharacterFromChat: createRemoveCharacterFromChat(ctx, emit, claimChat),
    setSeatKnobs: createSetSeatKnobs(ctx, emit, claimChat),
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
function createSetGroupConfig(ctx: ChatContext, emit: EmitChatEvent, claimChat: ClaimChatOp): ChatService["setGroupConfig"] {
  return async ({ principal, chatId, config }: SetGroupConfigParams) => {
    const { chat } = await requireHost(ctx, principal, chatId);
    await claimChat(chatId);
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
    await commitMetadataUpdate({
      ctx,
      ownerId: principal.userId,
      chatId,
      key: "group",
      value: parsed,
      effective: { ...chat.metadata, group: parsed },
      authority: "carried",
    });
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

/** `setRoomOverrides` — host-only. The three-field allowlist default-denies a stray field (including the
 *  RETIRED `authorsNote` — at-depth steering is a `chat_injections` row now). */
function createSetRoomOverrides(ctx: ChatContext, emit: EmitChatEvent, claimChat: ClaimChatOp): ChatService["setRoomOverrides"] {
  return async ({ principal, chatId, overrides }: SetRoomOverridesParams) => {
    const { chat } = await requireHost(ctx, principal, chatId);
    await claimChat(chatId);
    const parsed = roomOverridesSchema.safeParse(overrides);
    if (!parsed.success) {
      throw new ChatOperationError(
        CHAT_OP_CODES.forbiddenOverride,
        `chat ${chatId}: room overrides accept only the three-field allowlist (scenario / mainPrompt / postHistory)`,
      );
    }
    await commitMetadataUpdate({
      ctx,
      ownerId: principal.userId,
      chatId,
      key: "roomOverrides",
      value: parsed.data,
      effective: { ...chat.metadata, roomOverrides: parsed.data },
      authority: "carried",
    });
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
function createSetChatDocumentVisibility(ctx: ChatContext, emit: EmitChatEvent, claimChat: ClaimChatOp): ChatService["setChatDocumentVisibility"] {
  return async ({ principal, chatId, visibility }: SetChatDocumentVisibilityParams): Promise<ChatDocumentVisibility> => {
    const { chat } = await requireHost(ctx, principal, chatId);
    await claimChat(chatId);
    const parsed = chatDocumentVisibilitySchema.safeParse(visibility);
    if (!parsed.success) {
      throw new ChatOperationError(CHAT_OP_CODES.forbiddenOverride, `chat ${chatId}: databank visibility accepts only a { hidden: DocumentId[] } set`);
    }
    // The POST-WRITE metadata, for the background-availability guard only: the write itself touches this one
    // JSON path and never re-asserts the siblings (#1450).
    const effective: ChatMetadata = { ...chat.metadata, databankVisibility: parsed.data };
    await commitMetadataUpdate({ ctx, ownerId: principal.userId, chatId, key: "databankVisibility", value: parsed.data, effective, authority: "carried" });
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

/** `setHostDisplayScripts` — host-only. Writes the D121-E display-tier room OPTION into
 *  `chatMetadata.hostDisplayScripts`.
 *
 *  WHAT IT GOVERNS, precisely: with it ON, the HOST's display-tier (DISPLAY-placement, `enabled`) regex
 *  scripts render for EVERY viewer in this room — a host staging shared visual effects on the transcript.
 *  With it OFF (the default,
 *  and the byte-identical path) display regex is strictly per-user: a viewer only ever sees their own.
 *  Either way a viewer's OWN scripts still apply, and apply LAST, so a viewer can always counter-style.
 *
 *  RENDER-ONLY, both arms. Nothing here touches canon, the composer, an edit textarea, or any wire payload
 *  — the toggle is read by the CLIENT's message-render context, never by assembly or the engine. That is
 *  why a host cannot use it to rewrite what the model sees, only what the room LOOKS like.
 *
 *  The write MERGES into the sibling sub-blobs (`...chat.metadata`) so it never nukes roomOverrides/group. */
function createSetHostDisplayScripts(ctx: ChatContext, emit: EmitChatEvent, claimChat: ClaimChatOp): ChatService["setHostDisplayScripts"] {
  return async ({ principal, chatId, enabled }: SetHostDisplayScriptsParams): Promise<boolean> => {
    const { chat } = await requireHost(ctx, principal, chatId);
    await claimChat(chatId);
    // The POST-WRITE metadata, for the background-availability guard only: the write itself touches this one
    // JSON path and never re-asserts the siblings (#1450).
    const effective: ChatMetadata = { ...chat.metadata, hostDisplayScripts: enabled };
    await commitMetadataUpdate({ ctx, ownerId: principal.userId, chatId, key: "hostDisplayScripts", value: enabled, effective, authority: "carried" });
    await emit({ type: "chatUpdated", chatId });
    await ctx.audit(
      { actorUserId: principal.userId, action: "chat.setHostDisplayScripts", entityType: "chat", entityId: chatId, metadata: { enabled } },
      ctx.now(),
    );
    return enabled;
  };
}

/** `setRegexAllow` — host-only (#1742). Writes ONE of the room's regex levers: the master
 *  (`chatMetadata.regexEnabled`) or one entry of the per-tier allow map (`chatMetadata.regexTiers`).
 *
 *  ONE KEY PER CALL (#1450). The two levers are two different metadata keys, so the union in the params is
 *  not a convenience — it is what keeps this on the single-JSON-path write that cannot lose an update to a
 *  concurrent host knob. The TIER arm still read-modify-writes its own map (the `databankVisibility`
 *  set-semantics precedent), which is why the merge is server-side: the client flips one lever and never has
 *  to send back a map it might have raced against its own second device.
 *
 *  WRITING `true` IS NOT THE SAME AS NEVER HAVING WRITTEN, and here that distinction costs nothing: absent
 *  and `true` both mean "runs" (`isRegexTierAllowed`), so switching a tier back on is idempotent rather than
 *  a state the reader has to disambiguate.
 *
 *  HOST AUTHORITY for the `setOfferChoices` reason, not the display-scripts one: these levers decide which
 *  scripts the SHARED assembly runs, so they are prompt content for everyone in the room. `chatUpdated`
 *  carries it to every member's device (the room's own tier is member-readable), and the host's other
 *  devices repaint the section off the same event. */
function createSetRegexAllow(ctx: ChatContext, emit: EmitChatEvent, claimChat: ClaimChatOp): ChatService["setRegexAllow"] {
  return async ({ principal, chatId, lever }: SetRegexAllowParams): Promise<HostTierRegexAllow> => {
    const { chat } = await requireHost(ctx, principal, chatId);
    await claimChat(chatId);
    const stored = regexAllowOf(chat.metadata);
    const next: HostTierRegexAllow =
      lever.kind === "master"
        ? { enabled: lever.enabled, tiers: stored.tiers }
        : { enabled: stored.enabled, tiers: { ...stored.tiers, [lever.tier]: lever.enabled } };
    // The POST-WRITE metadata, for the background-availability guard only (#1450: the write itself touches
    // this one JSON path and never re-asserts the siblings).
    // `exactOptionalPropertyTypes`: an ABSENT lever must stay absent, never an explicit `undefined` (the two
    // read the same through `isRegexTierAllowed`, but the blob would grow a key that means nothing).
    const effective: ChatMetadata = {
      ...chat.metadata,
      ...(next.enabled === undefined ? {} : { regexEnabled: next.enabled }),
      ...(next.tiers === undefined ? {} : { regexTiers: next.tiers }),
    };
    if (lever.kind === "master") {
      await commitMetadataUpdate({ ctx, ownerId: principal.userId, chatId, key: "regexEnabled", value: lever.enabled, effective, authority: "carried" });
    } else {
      await commitMetadataUpdate({ ctx, ownerId: principal.userId, chatId, key: "regexTiers", value: next.tiers ?? {}, effective, authority: "carried" });
    }
    await emit({ type: "chatUpdated", chatId });
    await ctx.audit(
      {
        actorUserId: principal.userId,
        action: "chat.setRegexAllow",
        entityType: "chat",
        entityId: chatId,
        metadata: { lever: lever.kind, tier: lever.kind === "tier" ? lever.tier : null, enabled: lever.enabled },
      },
      ctx.now(),
    );
    return next;
  };
}

/** `setOfferChoices` — host-only. Writes the B1 offer-choices POSTURE into `chatMetadata.offerChoices`.
 *
 *  WHAT IT GOVERNS: with it ON, this room's turns teach the model the standing `:::choices` fence, and the
 *  reading surface renders an emitted fence as click-to-compose chips. That is PROMPT CONTENT for everyone in
 *  the room, which is why it is host authority and not a per-viewer preference — the display-scripts switch
 *  next door is deliberately the opposite (render-only, and it says so).
 *
 *  WRITING `false` IS NOT THE SAME AS NEVER HAVING WRITTEN. An absent key inherits the host's per-user
 *  default (`resolveOfferChoices`); an explicit `false` pins this room off even for a host who plays with
 *  choices on everywhere else. Both are reachable from the toggle, and that is the intended shape of "this
 *  room, specifically".
 *
 *  The write MERGES into the sibling sub-blobs (`...chat.metadata`) so it never nukes roomOverrides/group. */
function createSetOfferChoices(ctx: ChatContext, emit: EmitChatEvent, claimChat: ClaimChatOp): ChatService["setOfferChoices"] {
  return async ({ principal, chatId, enabled }: SetOfferChoicesParams): Promise<boolean> => {
    const { chat } = await requireHost(ctx, principal, chatId);
    await claimChat(chatId);
    // The POST-WRITE metadata, for the background-availability guard only: the write itself touches this one
    // JSON path and never re-asserts the siblings (#1450).
    const effective: ChatMetadata = { ...chat.metadata, offerChoices: enabled };
    await commitMetadataUpdate({ ctx, ownerId: principal.userId, chatId, key: "offerChoices", value: enabled, effective, authority: "carried" });
    await emit({ type: "chatUpdated", chatId });
    await ctx.audit({ actorUserId: principal.userId, action: "chat.setOfferChoices", entityType: "chat", entityId: chatId, metadata: { enabled } }, ctx.now());
    return enabled;
  };
}

/** `setCharactersCanReact` — host-only. Writes the B7 react-tool ATTACH posture into
 *  `chatMetadata.charactersCanReact` (the `setOfferChoices` twin — same merge-write, same tri-state:
 *  an absent key inherits the host's per-user default, an explicit `false` pins this room off, and BOTH
 *  tiers default OFF because an autonomous AI reacting is opt-in, owner requirement). Governs PROMPT
 *  CONTENT (the `react` tool + its description reach the wire), so host authority. */
function createSetCharactersCanReact(ctx: ChatContext, emit: EmitChatEvent, claimChat: ClaimChatOp): ChatService["setCharactersCanReact"] {
  return async ({ principal, chatId, enabled }: SetCharactersCanReactParams): Promise<boolean> => {
    const { chat } = await requireHost(ctx, principal, chatId);
    await claimChat(chatId);
    const effective: ChatMetadata = { ...chat.metadata, charactersCanReact: enabled };
    await commitMetadataUpdate({ ctx, ownerId: principal.userId, chatId, key: "charactersCanReact", value: enabled, effective, authority: "carried" });
    await emit({ type: "chatUpdated", chatId });
    await ctx.audit(
      { actorUserId: principal.userId, action: "chat.setCharactersCanReact", entityType: "chat", entityId: chatId, metadata: { enabled } },
      ctx.now(),
    );
    return enabled;
  };
}

/** `setReactionsEnabled` — host-only. Writes the B7 reaction-plane MASTER posture into
 *  `chatMetadata.reactionsEnabled`. Same shape as its sibling above, opposite default direction: the
 *  per-user default ships ON (B6 is a live feature — this knob makes it disableable, never quietly off).
 *  Resolved OFF is ENFORCED at the verbs (`toggleReaction` refuses `reactions_disabled`, `listReactions`
 *  answers `{enabled:false, groups:[]}`, the react tool refuses errors-as-data) — the client hiding is a
 *  courtesy over that enforcement, not the mechanism. */
function createSetReactionsEnabled(ctx: ChatContext, emit: EmitChatEvent, claimChat: ClaimChatOp): ChatService["setReactionsEnabled"] {
  return async ({ principal, chatId, enabled }: SetReactionsEnabledParams): Promise<boolean> => {
    const { chat } = await requireHost(ctx, principal, chatId);
    await claimChat(chatId);
    const effective: ChatMetadata = { ...chat.metadata, reactionsEnabled: enabled };
    await commitMetadataUpdate({ ctx, ownerId: principal.userId, chatId, key: "reactionsEnabled", value: enabled, effective, authority: "carried" });
    await emit({ type: "chatUpdated", chatId });
    await ctx.audit(
      { actorUserId: principal.userId, action: "chat.setReactionsEnabled", entityType: "chat", entityId: chatId, metadata: { enabled } },
      ctx.now(),
    );
    return enabled;
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
function createSetChatBackground(ctx: ChatContext, emit: EmitChatEvent, claimChat: ClaimChatOp): ChatService["setChatBackground"] {
  return async ({ principal, chatId, background }: SetChatBackgroundParams): Promise<ThemeBackground> => {
    const { chat } = await requireHost(ctx, principal, chatId);
    await claimChat(chatId);
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
    // The POST-WRITE metadata, for the background-availability guard only: the write itself touches this one
    // JSON path and never re-asserts the siblings (#1450).
    const effective: ChatMetadata = { ...chat.metadata, background: source };
    await commitMetadataUpdate({ ctx, ownerId: principal.userId, chatId, key: "background", value: source, effective, authority: "owned" });
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

/** `setToolRecurseLimit` — host-only write of the per-chat tool-call recursion cap
 *  (`chatMetadata.toolRecurseLimit`, 1..20). Merges into the sibling sub-blobs (`...chat.metadata`) so it never
 *  nukes roomOverrides/group. An out-of-range value is a `forbiddenOverride`, never a silent write. */
function createSetToolRecurseLimit(ctx: ChatContext, emit: EmitChatEvent, claimChat: ClaimChatOp): ChatService["setToolRecurseLimit"] {
  return async ({ principal, chatId, limit }: SetToolRecurseLimitParams): Promise<number> => {
    const { chat } = await requireHost(ctx, principal, chatId);
    await claimChat(chatId);
    const parsed = toolRecurseLimitSchema.safeParse(limit);
    if (!parsed.success) {
      throw new ChatOperationError(
        CHAT_OP_CODES.forbiddenOverride,
        `chat ${chatId}: toolRecurseLimit must be an integer between ${TOOL_RECURSE_LIMIT_MIN} and ${TOOL_RECURSE_LIMIT_MAX}`,
      );
    }
    const effective: ChatMetadata = { ...chat.metadata, toolRecurseLimit: parsed.data };
    await commitMetadataUpdate({ ctx, ownerId: principal.userId, chatId, key: "toolRecurseLimit", value: parsed.data, effective, authority: "carried" });
    await emit({ type: "chatUpdated", chatId });
    await ctx.audit(
      {
        actorUserId: principal.userId,
        action: "chat.setToolRecurseLimit",
        entityType: "chat",
        entityId: chatId,
        metadata: { limit: parsed.data },
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

/**
 * F6 (D166, arm (a)) — the IN-WINDOW join greeting. A character
 * added while the room's greeting window is still open greets, exactly as a founding member does; after the
 * window closes the join stays silent (today's late-add semantics). This preserves the one affordance the
 * deleted draft plane had here: a panel-added member's greeting row appeared before the first send, and
 * without it that UX silently regressed the day the draft plane went away.
 *
 * THE WINDOW is the same one `setSeededGreeting` refuses on (`greeting_frozen`, verbs/edit.ts): no user-role
 * canon row. That instant is also `freezeGreetingVolatiles` (verbs/turn.ts), which bakes every prior
 * greeting's volatile macros — so a row seeded here is guaranteed to still be malleable/steppable when it
 * lands, and one seeded a beat later would be a frozen row pretending to be a greeting.
 *
 * THE STATS DELTA IS THIS VERB'S OWN, unlike `startChat`'s founding greetings. The caller has already CLAIMED
 * the room (the ordering invariant, `verbs/claim-chat.ts`), so the creation replay has run over the canon that
 * existed BEFORE this row; a delta-less row here would be invisible to the live counters and red the stats
 * drift gate at the next reconcile. A verbatim greeting carries no generation economics — one variant,
 * selected at idx 0, every token/cost column null.
 *
 * Returns the committed view so the caller can fan `messageCommitted`, or null when nothing was seeded (the
 * window is closed, or the card carries no greeting).
 */
async function seedJoinGreeting(
  ctx: ChatContext,
  args: { readonly chatId: ChatId; readonly characterId: CharacterId; readonly card: CharacterCard; readonly ownerId: UserId },
): Promise<MessageView | null> {
  if (await loadHasUserMessage(ctx.db, args.chatId)) {
    return null;
  }
  const text = args.card.greetings[0]?.text ?? "";
  const now = ctx.now();
  const seed = buildGreetingSeed(ctx, {
    chatId: args.chatId,
    now,
    // The seat's own join boundary is the CURRENT head, so its greeting lands one past it — the joining
    // character witnesses the row it just spoke (D55).
    startSeq: await loadMaxMessageSeq(ctx.db, args.chatId),
    greetings: [{ characterId: args.characterId, text }],
  });
  const view = seed.views[0];
  if (view === undefined) {
    return null; // an empty/cleared card greeting seeds no row.
  }
  const stmts = [...seed.stmts];
  ctx.applyStatsDelta(
    stmts,
    ctx.db,
    canonMessageDelta({
      ownerId: args.ownerId,
      row: {
        characterId: args.characterId,
        role: "assistant",
        createdAt: now,
        content: text,
        tokensIn: null,
        tokensOut: null,
        tokenProvenance: "unrecorded",
        costUsd: null,
        cacheReadTokens: null,
        cacheWriteTokens: null,
        contextWindow: null,
        genStartedAt: null,
        genFinishedAt: null,
        model: null,
        provider: null,
        reasoning: null,
        metadata: null,
        selectedIdx: 0,
        variantCount: 1,
      },
      sign: 1,
      now,
    }),
  );
  await ctx.db.batch(batchMany(stmts));
  return view;
}

/** `addCharacterToChat` — host-only; the character participant-insert chokepoint. Stamps a fresh member
 *  row at the current canon head, emits chatUpdated, returns the resolved roster row. IDEMPOTENT: a character
 *  that already holds a PRESENT seat returns that seat's view unchanged — the character half of the roster has
 *  no `(chatId, userId)` unique (SQLite ignores the NULL userId), so this present-seat check is the ONLY server
 *  floor against a double-add (two present rows → double arbitration weight + multi-row knob updates). It is the
 *  floor RP1's `applyToChat` re-apply idempotency stands on (saved-rosters §7). Matches `kick`'s idempotent
 *  idiom (and the D60 design's still-unbuilt agent seat verb) — a re-add is a no-op, never a coded refusal. */
function createAddCharacterToChat(ctx: ChatContext, emit: EmitChatEvent, claimChat: ClaimChatOp): ChatService["addCharacterToChat"] {
  return async ({ principal, chatId, characterId }: AddCharacterToChatParams) => {
    const { chat } = await requireHost(ctx, principal, chatId);
    await claimChat(chatId);
    // The character must be the host's (owner-scoped read — foreign == missing, leak-free). A roster
    // character is always host-owned, keeping the stats rebuild's ownerId attribution consistent.
    const card = await ctx.getCard({ ownerId: principal.userId, characterId });
    if (card === null) {
      throw new DomainNotFoundError("character", characterId);
    }
    // Present-seat floor: return the live seat instead of minting a duplicate row. `loadParticipants` is present-only
    // (`leftSeq IS NULL`), so a previously-left character re-adds a fresh row (era-per-row, F8) as before.
    const existing = (await loadParticipants(ctx.db, chatId)).find((p) => {
      const actor = classifyParticipant(p);
      return actor?.kind === "character" && actor.characterId === characterId;
    });
    if (existing !== undefined) {
      return characterParticipantView(existing, card, ctx.resolveAssetHash);
    }
    const at = ctx.now();
    const joinSeq = await loadMaxMessageSeq(ctx.db, chatId);
    const participantId = ctx.newParticipantId();
    assertForcedCharacterMember({ kind: "character", role: "member" });
    const versionStatements: BatchStmt[] = [];
    // A LATER SEAT COUNTS THE ROOM TOO (#1147). The rebuild's per-character census is
    // `COUNT(DISTINCT cp.chat_id)` over seats, so a character joining a live room owes a `+1` here or the
    // live rollup reads 0 chats for it until somebody reconciles. Asked BEFORE the seat row commits and
    // over PAST seats too: a removed character keeps its `leftSeq`-stamped row, so a re-add mints a second
    // row for a pair the rebuild still counts ONCE. The stamps mirror the rebuild's own columns — the
    // room's `createdAt` is its `MIN(chats.created_at)` first-chat candidate, and a fork credits the
    // character's fork counter. `applyStatsDelta` carries the canon-version fence, so it replaces the bare
    // bump on this arm.
    const seated = await characterEverSeatedInChat(ctx.db, characterId, chatId);
    if (seated) {
      ctx.bumpStatsCanonVersion(versionStatements, ctx.db, principal.userId);
    } else {
      ctx.applyStatsDelta(
        versionStatements,
        ctx.db,
        seatChatDelta({
          ownerId: principal.userId,
          characterId,
          forked: chat.parentChatId !== null,
          newCharacter: !(await characterSeatedInAnotherChat(ctx.db, characterId, chatId)),
          now: chat.createdAt,
        }),
      );
    }
    await insertParticipants(
      ctx.db,
      [
        {
          id: participantId,
          chatId,
          kind: "character",
          characterId,
          role: "member",
          joinedAt: at,
          joinSeq,
        },
      ],
      versionStatements,
    );
    await emit({ type: "chatUpdated", chatId });
    // F6 — the in-window join greeting. AFTER the seat exists (the greeting is voiced BY a present member) and
    // after `chatUpdated`, so a client applying the commit already knows the speaker.
    const greeting = await seedJoinGreeting(ctx, { chatId, characterId, card, ownerId: principal.userId });
    if (greeting !== null) {
      await emit({ type: "messageCommitted", chatId, messageId: greeting.id, view: greeting });
    }
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
function createRemoveCharacterFromChat(ctx: ChatContext, emit: EmitChatEvent, claimChat: ClaimChatOp): ChatService["removeCharacterFromChat"] {
  return async ({ principal, chatId, characterId }: RemoveCharacterFromChatParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    await claimChat(chatId);
    // Present-only roster (`leftSeq IS NULL`); an already-left / never-present character has no seat → no-op.
    const seat = (await loadParticipants(ctx.db, chatId)).find((p) => {
      const actor = classifyParticipant(p);
      return actor?.kind === "character" && actor.characterId === characterId;
    });
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

function createSetSeatKnobs(ctx: ChatContext, emit: EmitChatEvent, claimChat: ClaimChatOp): ChatService["setSeatKnobs"] {
  return async ({ principal, chatId, participantId, patch }: SetSeatKnobsParams) => {
    await requireHost(ctx, principal, chatId);
    await claimChat(chatId);
    const seat = (await loadParticipants(ctx.db, chatId)).find((p) => p.id === participantId);
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
 *  containment path (doc 03 §5): userId-keyed, its agent-seat handling is UNBUILT (the D60 seat/unseat
 *  verbs don't exist yet — kick today only exercises the human leftSeq-stamp path above). A non-present
 *  target (or a characterId-only seat, which carries no userId) is an idempotent no-op. */
function createKick(ctx: ChatContext, emit: EmitChatEvent): ChatService["kick"] {
  return async ({ principal, chatId, userId }: KickParticipantParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    const target = (await loadParticipants(ctx.db, chatId)).find((p) => p.userId === userId);
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
    const target = (await loadParticipants(ctx.db, chatId)).find((p) => {
      const actor = classifyParticipant(p);
      return actor?.kind === "human" && actor.userId === userId;
    });
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
      await commitStatsFencedChatUpdate(ctx, principal.userId, ctx.db.update(chats).set({ archived: true, updatedAt: at }).where(eq(chats.id, chatId)));
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
  participants: readonly (typeof chatParticipants.$inferSelect)[],
): Promise<ChatParticipantId[]> {
  const characterSeats = participants.flatMap((p) => {
    const actor = classifyParticipant(p);
    return actor?.kind === "character" && p.leftSeq === null ? [{ id: p.id, characterId: actor.characterId }] : [];
  });
  const cards = await Promise.all(characterSeats.map((s) => ctx.getCard({ ownerId: newOwnerUserId, characterId: s.characterId })));
  return characterSeats.flatMap((s, i) => (cards[i] === null ? [s.id] : []));
}

/** `nominateHostHandoff` — host-only, step 1. Persists the pending nominee, emits chatUpdated, and notifies
 *  the nominee. The nominee must be a present non-host member — otherwise a leak-free NOT_FOUND. No role
 *  swap happens here; only the nominee's accept promotes. */
function createNominateHostHandoff(ctx: ChatContext, emit: EmitChatEvent): ChatService["nominateHostHandoff"] {
  return async ({ principal, chatId, userId, offer }: NominateHostHandoffParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    const participants = await loadParticipants(ctx.db, chatId);
    const nominee = participants.find((p) => p.userId === userId);
    if (nominee === undefined || nominee.role === "host") {
      throw new ChatNotFoundError(chatId);
    }
    // The offer is parsed at the trust boundary and DEFAULTS TO NOTHING: a malformed blob is no offer, never
    // a copy nobody asked for. It is stored, not executed — the accept freezes the point in time (§5), so an
    // edit the host makes between nominate and accept rides into the copy and a nomination that is never
    // accepted transfers nothing.
    const parsedOffer = handoffOfferSchema.catch(NO_HANDOFF_OFFER).parse(offer ?? NO_HANDOFF_OFFER);
    const statements: BatchStmt[] = [setPendingHostStatement(ctx.db, { chatId, nomineeUserId: userId, offer: parsedOffer, now: ctx.now() })];
    ctx.bumpStatsCanonVersion(statements, ctx.db, principal.userId);
    // THE NOMINATION DISCLOSES WHAT IT GIVES (#1762). The nominee decides from one inbox row, and accepting
    // lands characters, lore, the GM voice and this room's EXECUTABLE regex scripts in THEIR library — so the
    // counts ride the notification and their client confirms against them. Resolved from the copy's own
    // planners (`previewHandoffCopyPlan` beside `resolveHandoffCopyPlan`) over the participants already loaded
    // above; the departing host is the principal, who `requireHost` has just proven holds the room.
    const disclosure = await previewHandoffCopyPlan(ctx, {
      chatId,
      oldHostUserId: principal.userId,
      nomineeUserId: userId,
      offer: parsedOffer,
      participants,
    });
    await ctx.emitNotification({ type: "handoff-nominated", recipientUserId: userId, chatId, offer: disclosure }, statements);
    await emit({ type: "chatUpdated", chatId });
    await ctx.audit(
      {
        actorUserId: principal.userId,
        action: "chat.nominateHostHandoff",
        entityType: "chat",
        entityId: chatId,
        metadata: { nomineeUserId: userId, offerCharacters: parsedOffer.copyCharacters, offerGmPreset: parsedOffer.copyGmPreset },
      },
      ctx.now(),
    );
  };
}

/** Is the room's D51 anchor persona still READABLE once `newOwnerUserId` holds the room? The anchor is
 *  resolved under the HOST's principal (owner-scoped `persona.get`), so an anchor the incoming host does not
 *  own resolves null on their very next turn: `{{user}}` silently falls through to the speaker's active
 *  persona (the null-anchor fallback) while the knob keeps serving an id they can never inspect. `false` ⇒ the
 *  swap batch nulls it — the honest degrade. The ownership axis is the new owner regardless of who pinned it
 *  (the `resolveForkGmPreset` shape); an anchor the nominee owns is a live pin and is left alone. Personas are
 *  owner-sacred — this heals the pointer, it never copies a persona. */
function anchorSurvivesHandoff(ctx: ChatContext, newOwnerUserId: UserId, anchorPersonaId: PersonaId | null): Promise<boolean> {
  if (anchorPersonaId === null) {
    return Promise.resolve(true);
  }
  return ctx.verifyPersonaOwned({ ownerId: newOwnerUserId, personaId: anchorPersonaId });
}

/** Finish the only non-statement-shaped handoff tail. Actor re-keying runs first and is retry-safe; the
 * accepted-host-scoped marker then claims exactly one durable completion append in the same batch. */
async function completeHandoffResumption(ctx: ChatContext, emit: EmitChatEvent, resume: HandoffResumption): Promise<void> {
  if (resume.actorRekeys.length > 0) {
    await ctx.rpg?.handoffRekeyActors(resume.chatId, resume.actorRekeys);
  }
  if ((await emit({ type: "chatUpdated", chatId: resume.chatId }, clearHandoffResumptionStatement(ctx.db, resume.chatId, resume.acceptedByUserId))) === false) {
    throw new Error(`chat ${resume.chatId}: host handoff completion event was not durably appended`);
  }
}

async function commitHandoffSwap(
  ctx: ChatContext,
  statements: BatchStmt[],
  args: { readonly chatId: ChatId; readonly oldHostUserId: UserId | null; readonly newHost: Principal },
): Promise<void> {
  if (args.oldHostUserId !== null) {
    ctx.bumpStatsCanonVersion(statements, ctx.db, args.oldHostUserId);
  }
  if (args.oldHostUserId !== args.newHost.userId) {
    ctx.bumpStatsCanonVersion(statements, ctx.db, args.newHost.userId);
  }
  if (args.oldHostUserId !== null && args.oldHostUserId !== args.newHost.userId) {
    await ctx.emitNotification(
      {
        type: "handoff-accepted",
        recipientUserId: args.oldHostUserId,
        chatId: args.chatId,
        newHostHandle: args.newHost.handle,
      },
      statements,
    );
    return;
  }
  await ctx.db.batch(batchMany(statements));
}

/** `acceptHostHandoff` — step 2: the nominee accepts (a self-action). The caller must equal
 *  chats.pendingHostUserId, else not_turn_owner. On pass, atomically swaps roles, drops the outgoing host's
 *  character seats the new host doesn't own, HEALS the two room pointers that would otherwise degrade
 *  silently under the new authority (the D51 anchor persona + — through the injected rpg op — the game's
 *  GM-voice preset), and clears the nomination in one batch; emits chatUpdated and notifies the previous host.
 *
 *  WITH AN ACCEPTED OFFER (§5/§6(f)) it also executes the departing host's point-in-time gift: their seated
 *  cards, the lore behind them and the room's own regex scripts are copied into the nominee's library, and
 *  this room is re-pointed onto the copies — seats IN PLACE (era, knobs and identity preserved), canon
 *  `messages.characterId`, the derived digest keys, rpg's sheets, and the `chat_regex_scripts` attachments
 *  (#1739, at their stored positions so the transform chain survives byte-identical). Message VARIANTS need
 *  no copying: they are this chat's rows and transfer by construction. From the swap onward the room
 *  references only the new host's property, so the old host editing or deleting their originals cannot reach
 *  it — which is the whole point of the arm.
 *
 *  Everything ROOM-side rides ONE batch (including the copy): the heals and the re-points
 *  are properties of the authority move, so a crash must never be able to land the promotion without them.
 *  The LIBRARY mints necessarily precede it — see {@link executeHandoffCopy} for the crash contract. The audit
 *  row records what fired, so the transfer stays inspectable rather than silent. */
function createAcceptHostHandoff(ctx: ChatContext, emit: EmitChatEvent): ChatService["acceptHostHandoff"] {
  return async ({ principal, chatId }: AcceptHostHandoffParams): Promise<void> => {
    const { chat } = await requireParticipant(ctx, principal, chatId);
    const resumable = await loadHandoffResumption(ctx.db, chatId);
    if (resumable !== null) {
      if (resumable.acceptedByUserId !== principal.userId) {
        throw new ChatOperationError(CHAT_OP_CODES.notTurnOwner, `chat ${chatId}: only the accepted host may resume the host handoff`);
      }
      await completeHandoffResumption(ctx, emit, resumable);
      return;
    }
    const { pendingHostUserId, offer } = await loadPendingHandoff(ctx.db, chatId);
    if (pendingHostUserId === null || pendingHostUserId !== principal.userId) {
      throw new ChatOperationError(CHAT_OP_CODES.notTurnOwner, `chat ${chatId}: only the nominated member may accept the host handoff`);
    }
    // The previous host (for the post-swap notification) may be absent if they left after nominating.
    const participants = await loadParticipants(ctx.db, chatId);
    const oldHostUserId = hostUserIdOf(participants);
    const plan = await resolveHandoffCopyPlan(ctx, { chatId, oldHostUserId, nomineeUserId: principal.userId, offer, participants });
    const repointed = new Set(plan.seats.map((s) => s.participantId));
    // The D64 drop, minus whatever the offer just rescued: a seat now pointing at the nominee's own copy
    // resolves under them and must NOT also be stamped as left.
    const droppedSeatIds = (await resolveDroppedCharacterSeatIds(ctx, principal.userId, participants)).filter((id) => !repointed.has(id));
    const dropSeq = await loadMaxMessageSeq(ctx.db, chatId);
    const clearAnchorPersona = !(await anchorSurvivesHandoff(ctx, principal.userId, chat.anchorPersonaId));
    const acceptedAt = ctx.now();
    // The rpg-side heal (F1) + sheet re-key arrive as UNEXECUTED statements so they commit with the swap; `[]`
    // for a non-game room / an unwired rpg ⇒ byte-identical to a plain handoff.
    const rpgHeal =
      (await ctx.rpg?.handoffHealStatements({
        chatId,
        newHostUserId: principal.userId,
        oldHostUserId,
        copyGmPreset: offer.copyGmPreset,
        cardCopies: plan.cardCopies,
      })) ?? [];
    const digestRestamp = plan.cardCopies.length === 0 ? [] : await ctx.restampHandoffDigests({ chatId, pairs: plan.cardCopies });
    const swap = [
      ...acceptHostHandoffSwapStatements(ctx.db, {
        chatId,
        nomineeUserId: principal.userId,
        now: acceptedAt,
        clearAnchorPersona,
      }),
      ...plan.seats.map(({ participantId, copy }) => repointCharacterSeatStatement(ctx.db, participantId, copy.characterId)),
      ...plan.cardCopies.map((c) => restampChatCharacterStatement(ctx.db, chatId, c.sourceCharacterId, c.characterId)),
      ...digestRestamp,
      ...plan.bookRepoint,
      ...plan.regexRepoint,
      ...droppedSeatIds.map((id) => markParticipantLeftStatement(ctx.db, id, dropSeq)),
      ...rpgHeal,
      insertHandoffResumptionStatement(ctx.db, {
        chatId,
        acceptedByUserId: principal.userId,
        actorRekeys: plan.cardCopies,
        now: acceptedAt,
      }),
      ctx.auditStatement(
        {
          actorUserId: principal.userId,
          action: "chat.acceptHostHandoff",
          entityType: "chat",
          entityId: chatId,
          metadata: {
            previousHostUserId: oldHostUserId,
            healedAnchorPersona: clearAnchorPersona,
            healedGmPreset: rpgHeal.length > 0,
            copiedCards: plan.cardCopies.length,
            droppedSeats: droppedSeatIds.length,
          },
        },
        acceptedAt,
      ),
    ];
    await commitHandoffSwap(ctx, swap, { chatId, oldHostUserId, newHost: principal });
    await completeHandoffResumption(ctx, emit, {
      chatId,
      acceptedByUserId: principal.userId,
      actorRekeys: plan.cardCopies,
    });
  };
}
