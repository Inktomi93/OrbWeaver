// The canon-edit verbs (non-generation slot/variant mutations). A message is a slot (messages) joined to
// its selected variant: an edit mutates the variant content/reasoning, or the slot's selection/attribution/
// hidden/seq — never doubling content. Each verb: gate → the correct mutation → emit the room-public bus
// event → return the fresh MessageView (or void for the bulk mutators).
//
// Authority: edit/delete a slot is author-or-host; reorder + re-attribute is host-only. The bulk
// deleteMessages gates each target's author independently (the host clears any; a member clears only their own).
//
// reattributeMessages/reattributePersona deliberately emit one messageEdited per slot (an attribution
// re-stamp is a slot edit). duplicateMessage copies the selected variant's content + economics; params/
// promptSnapshot are not carried onto the copy (a duplicate is a fresh slot).
//
// THE §3.6 RETURN BELT (D110 §3.6 / D106 one-verdict). Every verb here that hands a `MessageView` back to its
// CALLER routes the return through {@link projectEditReturn} — the same seam `turn.ts` and (via
// `projectViewForMember`) `listMessages` use. It is a FAIL-CLOSED belt, not a live hole being patched: the
// author-or-host gate already means only a HOST reaches a reasoning-carrying row, because every producer writes
// assistant slots with `authorUserId: null` (turn commit + postNarratorMessage) and a human's own user row
// carries no model reasoning. But that is a WRITE-SIDE convention, not a schema guarantee — the
// `messages_attribution_shape` CHECK permits `role='assistant'` + a non-null `author_user_id` — so a future
// producer stamping an author onto a generated row would silently turn these returns into a member-reachable
// reasoning/hidden-span leak. The belt makes the boundary hold on the CALLER's role instead of on that
// convention. The invariant itself is separately named by a test (engine.int: a reasoning-carrying assistant
// slot is authorUserId-null), so a violating write is caught by a red test, not by a leak.
//
// The EMITTED bus event deliberately carries the UNSTRIPPED view: the bus fan-out strips per-SUBSCRIBER
// (`stripChatEventForMember` at the live transport + the durable replay), so pre-stripping here would withhold
// the host's own payload. Strip the return; emit the truth.

import type { DurableChatBusEvent, MessageView, ReattributeScope } from "@orb/contracts/chat";
import type { StatsDelta } from "@orb/contracts/stats";
import { batchMany } from "@orb/db/kit";
import type { ChatId, MessageId, PersonaId, UserId } from "@orb/kit/ids";
import type { RegexPlacement } from "@orb/kit/regex";
import { executeRegexScripts } from "@orb/kit/regex";
import { stripSelfSpeakerLabel } from "@orb/kit/speaker-label";
import type { ChatContext } from "../context.ts";
import type { ClaimChatOp } from "../contract/context.ts";
import { CHAT_OP_CODES, ChatNotFoundError, ChatOperationError } from "../contract/errors.ts";
import type { ResolveForeignInputsOp } from "../contract/foreign.ts";
import type {
  ClearReasoningParams,
  DeleteMessagesParams,
  DuplicateMessageParams,
  EditMessageParams,
  EditReasoningParams,
  MoveMessageParams,
  ReattributeMessagesParams,
  ReattributePersonaParams,
  SelectVariantParams,
  SetMessageHiddenParams,
  SetSeededGreetingParams,
} from "../contract/params.ts";
import type { ChatService } from "../contract/service.ts";
import { requireAuthorOrHost, requireHost, requireParticipant } from "../guard.ts";
import {
  buildCommittedMessageView,
  deleteMessagesStatement,
  editMessageContentStatements,
  editReasoningStatements,
  insertCanonMessageStatements,
  reattributeMessagesStatement,
  reattributePersonaStatement,
  selectActiveVariantStatement,
  setMessageHiddenStatement,
  setMessageSeqStatement,
  shiftSeqRangeStatement,
} from "../persistence/canon-write.ts";
import {
  loadAuthoredUserMessageIds,
  loadCanonStatRows,
  loadHasUserMessage,
  loadMaxMessageSeq,
  loadMessageSeqs,
  loadMessageView,
  loadSwipeStatRows,
  loadVariableDeltas,
  loadVariantDelta,
  loadVariantMessageId,
  loadVariantsByMessageIds,
} from "../persistence/queries.ts";
import { loadRoster } from "../persistence/roster.ts";
import { gatherAssembleContext } from "../substrate/assemble-gather.ts";
import { buildTurnMacroContext } from "../substrate/assembly-access.ts";
import { assertAuthorOrHost } from "../substrate/auth/index.ts";
import { projectViewReturnForViewer } from "../substrate/member-visibility.ts";
import { resolveHostTierRegexScripts } from "../substrate/regex-tier.ts";
import { hostUserIdOf } from "../substrate/roster-host.ts";
import { presentHumanUserIdsOf } from "../substrate/roster-humans.ts";
import { foldChain, runtimeVariablesUpdateStatement } from "../substrate/runtime-variables.ts";
import { canonMessageDelta, editMessageDelta, swipeVariantDelta } from "../substrate/stats-delta.ts";

/** The emit op the edit verbs close over. */
type EmitChatEvent = (event: DurableChatBusEvent) => Promise<void>;

/** The collaborators not on `ChatContext`. `resolveForeignInputs` backs the runOnEdit re-apply only:
 *  editMessage needs the host-global + chat-preset regex sources. */
interface EditDeps {
  readonly emit: EmitChatEvent;
  readonly resolveForeignInputs: ResolveForeignInputsOp;
  /** The husk→real transition (R0). Applied to the WHOLE bundle by {@link claiming}, not per verb. */
  readonly claimChat: ClaimChatOp;
}

/** The canon-edit slice of `ChatService` this grouped file owns. */
type EditVerbs = Pick<
  ChatService,
  | "selectVariant"
  | "editMessage"
  | "setSeededGreeting"
  | "setMessageHidden"
  | "deleteMessages"
  | "editReasoning"
  | "clearReasoning"
  | "moveMessage"
  | "duplicateMessage"
  | "reattributeMessages"
  | "reattributePersona"
>;

/** The §3.6 RETURN belt (see the file header): the ONE projection every edit-verb `MessageView` return routes
 *  through. Binds this domain's rpg deception verdict onto the shared `projectViewReturnForViewer` seam. A HOST
 *  caller is IDENTITY — the same object, no rpg read — so the host return stays byte-identical; a non-host
 *  caller gets the hidden-span body strip plus, on a deception-active game, the reasoning channel withheld. */
async function projectEditReturn(ctx: ChatContext, view: MessageView, viewer: { readonly role: string }): Promise<MessageView> {
  return await projectViewReturnForViewer(view, viewer, async (chatId) => (await ctx.rpg?.resolveReasoningHostOnly(chatId)) ?? false);
}

/** Loads a slot joined to its selected variant and verifies it belongs to `chatId` — a missing or
 *  foreign-chat slot collapses to one leak-free NOT_FOUND. */
async function loadSlotInChat(ctx: ChatContext, chatId: ChatId, messageId: MessageId): Promise<MessageView> {
  const view = await loadMessageView(ctx.db, messageId);
  if (view === undefined || view.chatId !== chatId) {
    throw new ChatNotFoundError(chatId);
  }
  return view;
}

/** Re-reads a slot's MessageView after a write. A racing delete surfaces as a leak-free NOT_FOUND. */
async function reloadSlot(ctx: ChatContext, chatId: ChatId, messageId: MessageId): Promise<MessageView> {
  const view = await loadMessageView(ctx.db, messageId);
  if (view === undefined) {
    throw new ChatNotFoundError(chatId);
  }
  return view;
}

/** Strips a leaked leading self-label from a character-voiced slot edit; a user/system row keeps its
 *  content verbatim. A hostless room / null card degrades to a tag-only no-op, never an error. */
async function purifyEditedContent(
  ctx: ChatContext,
  args: {
    readonly hostUserId: UserId | null;
    readonly slot: MessageView;
    readonly content: string;
  },
): Promise<string> {
  if (args.slot.characterId === null || args.hostUserId === null) {
    return args.content;
  }
  const card = await ctx.getCard({
    ownerId: args.hostUserId,
    characterId: args.slot.characterId,
  });
  return stripSelfSpeakerLabel(args.content, card?.name ?? "");
}

/** The receive-tier placement an edited slot's role re-runs: an assistant edit re-applies AI_OUTPUT, a user
 *  edit USER_INPUT. A system slot has no edit-tier leg. */
function editPlacementFor(role: MessageView["role"]): RegexPlacement | null {
  if (role === "assistant") {
    return "AI_OUTPUT";
  }
  return role === "user" ? "USER_INPUT" : null;
}

/**
 * Re-runs the host-tier receive regex, filtered to runOnEdit === true, on an edited slot's content before
 * persist. The script set is the same union a turn resolves — ONE seam (`ctx.resolveRegexSources`), so the
 * edit path can never drift from the turn path the way three hand-assembled blob reads could.
 * Two-phase so the no-script common case stays cheap: only when a runOnEdit script exists is the full
 * assemble ctx gathered. No PRNG is threaded (stable resolution — an edit must not draw randomPick).
 */
async function applyRunOnEditRegex(
  ctx: ChatContext,
  deps: EditDeps,
  args: {
    readonly chatId: ChatId;
    readonly slot: MessageView;
    readonly roster: Awaited<ReturnType<typeof loadRoster>>;
    readonly hostUserId: UserId | null;
    readonly anchorPersonaId: PersonaId | null;
    readonly editorUserId: UserId;
    readonly editorPersonaId: PersonaId | null;
    readonly content: string;
  },
): Promise<string> {
  const placement = editPlacementFor(args.slot.role);
  if (placement === null || args.hostUserId === null) {
    return args.content;
  }
  const { chatId, hostUserId } = args;
  const model = args.slot.model ?? "";
  const castCharacterIds = args.roster.flatMap((r) => (r.kind === "character" && r.characterId !== null ? [r.characterId] : []));
  const personaIds = args.editorPersonaId !== null ? [args.editorPersonaId] : [];
  const foreign = await deps.resolveForeignInputs({
    chatId,
    runAsUserId: hostUserId,
    model,
    anchorPersonaId: args.anchorPersonaId,
    // The consent set for the persona read — the editor is a member of this room, so their own persona (and
    // a member-owned anchor) resolve exactly as they do on a turn.
    presentHumanUserIds: presentHumanUserIdsOf(args.roster),
    // The EDITOR is the triggering human: a runOnEdit re-apply re-runs THEIR receive-tier leg on THEIR row,
    // so `{{user}}` is theirs exactly as it was on the turn that authored it (a null seat persona floors,
    // never borrows). Byte-identical to the retired `personaIds[0]` arm, which resolved to this same id
    // because the list was built from this one persona.
    trigger: { kind: "human", userId: args.editorUserId, personaId: args.editorPersonaId },
  });
  const scripts = resolveHostTierRegexScripts(
    await ctx.resolveRegexSources({ ownerId: hostUserId, presetId: foreign.presetId ?? null, characterIds: castCharacterIds, chatId }),
  ).filter((script) => script.runOnEdit === true);
  if (scripts.length === 0) {
    return args.content;
  }
  const assembleContext = await gatherAssembleContext(ctx, { chatId, runAsUserId: hostUserId, model, castCharacterIds, personaIds }, foreign);
  return executeRegexScripts({
    text: args.content,
    scripts,
    placement,
    ctx: buildTurnMacroContext({ assembleCtx: assembleContext, model, chatId }),
    applyReplace: ctx.applyRegexReplace,
  });
}

/** The stats owner for a canon mutation — the room host. A hostless room (archived orphan) degrades to the
 *  acting caller so the delta is never dropped. */
async function resolveStatsOwner(
  ctx: ChatContext,
  chatId: ChatId,
  fallback: MessageView["authorUserId"] & {},
): Promise<NonNullable<MessageView["authorUserId"]>> {
  const roster = await loadRoster(ctx.db, chatId);
  return hostUserIdOf(roster) ?? fallback;
}

/** One raw message_variants row (a slot's stored variant — the selected one or a swipe). */
type VariantRow = Awaited<ReturnType<typeof loadVariantsByMessageIds>>[number];

/** Maps a slot + one of its variants to the canonMessageDelta message-stream row. Attribution is
 *  slot-level; economics + gen bounds + idx are the variant's own. */
function canonRowOf(slot: MessageView, variant: VariantRow, variantCount: number): Parameters<typeof canonMessageDelta>[0]["row"] {
  return {
    characterId: slot.characterId,
    role: slot.role,
    createdAt: slot.createdAt,
    content: variant.content,
    tokensIn: variant.tokensIn,
    tokensOut: variant.tokensOut,
    costUsd: variant.costUsd,
    cacheReadTokens: variant.cacheReadTokens,
    cacheWriteTokens: variant.cacheWriteTokens,
    contextWindow: variant.contextWindow,
    genStartedAt: variant.genStartedAt,
    genFinishedAt: variant.genFinishedAt,
    model: variant.model,
    provider: variant.provider,
    reasoning: variant.reasoning,
    metadata: variant.metadata,
    selectedIdx: variant.idx,
    variantCount,
  };
}

/** Maps a slot + one of its variants to the swipeVariantDelta swipe-stream row (no cost/cache/context — a
 *  swipe credits the re-roll counters + scalar tokens only). */
function swipeRowOf(slot: MessageView, variant: VariantRow): Parameters<typeof swipeVariantDelta>[0]["row"] {
  return {
    characterId: slot.characterId,
    msgCreatedAt: slot.createdAt,
    content: variant.content,
    tokensIn: variant.tokensIn,
    tokensOut: variant.tokensOut,
    genStartedAt: variant.genStartedAt,
    genFinishedAt: variant.genFinishedAt,
    model: variant.model,
    provider: variant.provider,
    reasoning: variant.reasoning,
    metadata: variant.metadata,
  };
}

/** `selectVariant` — author-or-host. Flips messages.selectedVariantId to a sibling swipe (a pointer move,
 *  never a content copy). The variant must belong to the slot else a leak-free NOT_FOUND. Emits variantSelected. */
function createSelectVariant(ctx: ChatContext, emit: EmitChatEvent): ChatService["selectVariant"] {
  return async ({ principal, chatId, messageId, variantId }: SelectVariantParams) => {
    const slot = await loadSlotInChat(ctx, chatId, messageId);
    const membership = await requireAuthorOrHost(ctx, principal, chatId, slot.authorUserId);
    const owner = await loadVariantMessageId(ctx.db, variantId);
    if (owner !== messageId) {
      throw new ChatNotFoundError(chatId);
    }
    // Re-folds chats.runtime_variables for the new pointer in the same batch as the flip: the newly-selected
    // variant's delta replaces this slot's contribution, so a swipe to a variant that never set X rewinds X.
    const [currentDeltas, newDelta] = await Promise.all([loadVariableDeltas(ctx.db, chatId), loadVariantDelta(ctx.db, variantId)]);
    const postEntries = currentDeltas.map((e) => (e.messageId === messageId ? { seq: e.seq, delta: newDelta } : e));
    const statements = [selectActiveVariantStatement(ctx.db, messageId, variantId), runtimeVariablesUpdateStatement(ctx.db, chatId, foldChain(postEntries))];
    // A selection flip changes what reconcileStats folds: push the same 4-part signed swap the engine's
    // append-variant arm proves (-old-as-message, +old-as-swipe, -new-as-swipe, +new-as-message).
    const now = ctx.now();
    const ownerId = await resolveStatsOwner(ctx, chatId, principal.userId);
    const variants = await loadVariantsByMessageIds(ctx.db, [messageId]);
    const oldVariant = variants.find((v) => v.id === slot.selectedVariantId);
    const newVariant = variants.find((v) => v.id === variantId);
    if (oldVariant !== undefined && newVariant !== undefined) {
      const variantCount = variants.length;
      const swap: StatsDelta[] = [
        canonMessageDelta({
          ownerId,
          sign: -1,
          now,
          row: canonRowOf(slot, oldVariant, variantCount),
        }),
        swipeVariantDelta({ ownerId, sign: 1, now, row: swipeRowOf(slot, oldVariant) }),
        swipeVariantDelta({ ownerId, sign: -1, now, row: swipeRowOf(slot, newVariant) }),
        canonMessageDelta({
          ownerId,
          sign: 1,
          now,
          row: canonRowOf(slot, newVariant, variantCount),
        }),
      ];
      for (const delta of swap) {
        ctx.applyStatsDelta(statements, ctx.db, delta);
      }
    }
    await ctx.db.batch(batchMany(statements));
    const view = await reloadSlot(ctx, chatId, messageId);
    await emit({ type: "variantSelected", chatId, messageId, view });
    return await projectEditReturn(ctx, view, membership);
  };
}

/** `editMessage` — author-or-host. Overwrites the selected variant's content in place + stamps editedAt.
 *  Persist order: canon-purity strip, then the runOnEdit receive-tier regex re-apply, then the write.
 *  Emits messageEdited. */
function createEditMessage(ctx: ChatContext, deps: EditDeps): ChatService["editMessage"] {
  return async ({ principal, chatId, messageId, content }: EditMessageParams) => {
    const slot = await loadSlotInChat(ctx, chatId, messageId);
    const membership = await requireAuthorOrHost(ctx, principal, chatId, slot.authorUserId);
    const roster = await loadRoster(ctx.db, chatId);
    const hostUserId = hostUserIdOf(roster);
    const purified = await purifyEditedContent(ctx, { hostUserId, slot, content });
    const clean = await applyRunOnEditRegex(ctx, deps, {
      chatId,
      slot,
      roster,
      hostUserId,
      anchorPersonaId: membership.chat.anchorPersonaId,
      editorUserId: principal.userId,
      editorPersonaId: membership.activePersonaId,
      content: purified,
    });
    const now = ctx.now();
    const statements = editMessageContentStatements(ctx.db, {
      messageId,
      variantId: slot.selectedVariantId,
      content: clean,
      editedAt: now,
    });
    // The net word/byte change rides the same batch as the edit, bucketed on the slot's original day.
    ctx.applyStatsDelta(
      statements,
      ctx.db,
      editMessageDelta({
        ownerId: hostUserId ?? principal.userId,
        characterId: slot.characterId,
        role: slot.role,
        createdAt: slot.createdAt,
        oldContent: slot.content,
        newContent: clean,
        now,
      }),
    );
    await ctx.db.batch(batchMany(statements));
    const view = await reloadSlot(ctx, chatId, messageId);
    await deps.emit({ type: "messageEdited", chatId, messageId, view });
    return await projectEditReturn(ctx, view, membership);
  };
}

/**
 * `setSeededGreeting` — HOST-only. Steps a seeded greeting row onto another of its character card's
 * alternates (chat-creation-draft-mode-replacement.md §4.8, fork F6).
 *
 * WHY IT IS ITS OWN VERB and not an arm of `editMessage`: the two differ on every axis that matters. This one
 * is HOST-only where edit is author-or-host, it is WINDOWED where edit is always-on, and — the load-bearing
 * one — it takes an INDEX, so the content it writes is the card's own bytes rather than the caller's. Folding
 * it into edit would have meant a host-gated free-text path with a `greetingIndex` beside it, i.e. two
 * authorities and two content sources in one verb.
 *
 * THE THREE BELTS, all before any write:
 *  (a) the slot is a character-voiced ASSISTANT row in THIS chat — a user/system/narrator row has no card
 *      alternates to step among (`not_greeting_row`; a foreign/missing slot is the usual leak-free NOT_FOUND);
 *  (b) the room has NO user-role canon row — the first user turn is the FREEZE
 *      (`freezeGreetingVolatiles`, verbs/turn.ts) after which the greeting's volatile macros are baked into
 *      the variant, so stepping it would discard drawn values and rewrite settled canon (`greeting_frozen`);
 *  (c) the index resolves against the card, read under the HOST's ownership exactly as `startChat` seeded it
 *      (`greeting_alternate_not_found`).
 *
 * The write itself is the ordinary content edit — the same statements, the same `editMessageDelta`, the same
 * `messageEdited` event — so a stepped greeting is indistinguishable downstream from an edited one, which is
 * what keeps stats, the bus and the read path from needing a third shape.
 */
function createSetSeededGreeting(ctx: ChatContext, emit: EmitChatEvent): ChatService["setSeededGreeting"] {
  return async ({ principal, chatId, messageId, greetingIndex }: SetSeededGreetingParams) => {
    const membership = await requireHost(ctx, principal, chatId);
    const slot = await loadSlotInChat(ctx, chatId, messageId);
    if (slot.role !== "assistant" || slot.characterId === null) {
      throw new ChatOperationError(CHAT_OP_CODES.notGreetingRow, `chat ${chatId}: only a character-voiced greeting row has alternates to step`);
    }
    if (await loadHasUserMessage(ctx.db, chatId)) {
      throw new ChatOperationError(CHAT_OP_CODES.greetingFrozen, `chat ${chatId}: the greeting froze at the first user turn`);
    }
    const roster = await loadRoster(ctx.db, chatId);
    const hostUserId = hostUserIdOf(roster);
    if (hostUserId === null) {
      throw new ChatNotFoundError(chatId);
    }
    const card = await ctx.getCard({ ownerId: hostUserId, characterId: slot.characterId });
    const alternate = card?.greetings[greetingIndex]?.text;
    if (alternate === undefined) {
      throw new ChatOperationError(CHAT_OP_CODES.greetingAlternateNotFound, `chat ${chatId}: greeting ${String(greetingIndex)} is not on this card`);
    }
    const now = ctx.now();
    const statements = editMessageContentStatements(ctx.db, {
      messageId,
      variantId: slot.selectedVariantId,
      content: alternate,
      editedAt: now,
    });
    ctx.applyStatsDelta(
      statements,
      ctx.db,
      editMessageDelta({
        ownerId: hostUserId,
        characterId: slot.characterId,
        role: slot.role,
        createdAt: slot.createdAt,
        oldContent: slot.content,
        newContent: alternate,
        now,
      }),
    );
    await ctx.db.batch(batchMany(statements));
    const view = await reloadSlot(ctx, chatId, messageId);
    await emit({ type: "messageEdited", chatId, messageId, view });
    return await projectEditReturn(ctx, view, membership);
  };
}

/** `setMessageHidden` — author-or-host. Holds the slot out of assembly (or restores it) — a pure slot-flag
 *  write, no content change. Emits messageHidden. */
function createSetMessageHidden(ctx: ChatContext, emit: EmitChatEvent): ChatService["setMessageHidden"] {
  return async ({ principal, chatId, messageId, hidden }: SetMessageHiddenParams) => {
    const slot = await loadSlotInChat(ctx, chatId, messageId);
    const membership = await requireAuthorOrHost(ctx, principal, chatId, slot.authorUserId);
    await ctx.db.batch(batchMany([setMessageHiddenStatement(ctx.db, messageId, hidden)]));
    const view = await reloadSlot(ctx, chatId, messageId);
    await emit({ type: "messageHidden", chatId, messageId, view });
    return await projectEditReturn(ctx, view, membership);
  };
}

/** Writes the selected variant's reasoning (text or null) + stamps editedAt. Shared by edit/clear. */
async function writeReasoning(
  ctx: ChatContext,
  emit: EmitChatEvent,
  args: {
    readonly chatId: ChatId;
    readonly messageId: MessageId;
    readonly variantId: MessageView["selectedVariantId"];
    readonly reasoning: string | null;
    readonly event: "reasoningEdited" | "reasoningCleared";
    /** The gated caller's role — the §3.6 return belt's verdict axis (see the file header). */
    readonly viewer: { readonly role: string };
  },
): Promise<MessageView> {
  await ctx.db.batch(
    batchMany(
      editReasoningStatements(ctx.db, {
        messageId: args.messageId,
        variantId: args.variantId,
        reasoning: args.reasoning,
        editedAt: ctx.now(),
      }),
    ),
  );
  const view = await reloadSlot(ctx, args.chatId, args.messageId);
  await emit({ type: args.event, chatId: args.chatId, messageId: args.messageId, view });
  return await projectEditReturn(ctx, view, args.viewer);
}

/** `editReasoning` — author-or-host. Overwrites the selected variant's reasoning text. Emits reasoningEdited. */
function createEditReasoning(ctx: ChatContext, emit: EmitChatEvent): ChatService["editReasoning"] {
  return async ({ principal, chatId, messageId, reasoning }: EditReasoningParams) => {
    const slot = await loadSlotInChat(ctx, chatId, messageId);
    const membership = await requireAuthorOrHost(ctx, principal, chatId, slot.authorUserId);
    return await writeReasoning(ctx, emit, {
      chatId,
      messageId,
      variantId: slot.selectedVariantId,
      reasoning,
      event: "reasoningEdited",
      viewer: membership,
    });
  };
}

/** `clearReasoning` — author-or-host. Nulls the selected variant's reasoning. Emits reasoningCleared. */
function createClearReasoning(ctx: ChatContext, emit: EmitChatEvent): ChatService["clearReasoning"] {
  return async ({ principal, chatId, messageId }: ClearReasoningParams) => {
    const slot = await loadSlotInChat(ctx, chatId, messageId);
    const membership = await requireAuthorOrHost(ctx, principal, chatId, slot.authorUserId);
    return await writeReasoning(ctx, emit, {
      chatId,
      messageId,
      variantId: slot.selectedVariantId,
      reasoning: null,
      event: "reasoningCleared",
      viewer: membership,
    });
  };
}

/** `deleteMessages` — gates each target's author independently, then deletes the set (variants cascade).
 *  Emits messagesDeleted. An empty set is an idempotent no-op. */
function createDeleteMessages(ctx: ChatContext, emit: EmitChatEvent): ChatService["deleteMessages"] {
  return async ({ principal, chatId, messageIds }: DeleteMessagesParams): Promise<void> => {
    if (messageIds.length === 0) {
      return;
    }
    const membership = await requireParticipant(ctx, principal, chatId);
    const slots = await Promise.all(messageIds.map((id) => loadMessageView(ctx.db, id)));
    for (const slot of slots) {
      if (slot === undefined || slot.chatId !== chatId) {
        throw new ChatNotFoundError(chatId);
      }
      assertAuthorOrHost(ctx.can, { principal, role: membership.role, authorUserId: slot.authorUserId }, chatId);
    }
    // Each removed slot's selected-variant contribution + its non-selected swipes are subtracted in the
    // same batch as the delete. Rows are read before the delete lands.
    const now = ctx.now();
    const ownerId = await resolveStatsOwner(ctx, chatId, principal.userId);
    const statRows = await loadCanonStatRows(ctx.db, chatId, messageIds);
    const swipeRows = await loadSwipeStatRows(ctx.db, chatId, messageIds);
    const statements = [deleteMessagesStatement(ctx.db, chatId, messageIds)];
    for (const row of statRows) {
      ctx.applyStatsDelta(statements, ctx.db, canonMessageDelta({ ownerId, row, sign: -1, now }));
    }
    for (const row of swipeRows) {
      ctx.applyStatsDelta(statements, ctx.db, swipeVariantDelta({ ownerId, row, sign: -1, now }));
    }
    // Re-folds chats.runtime_variables over the chain minus the deleted slots, in the same batch as the delete.
    // A standalone (out-of-turn) delta entry carries `messageId === null` — never a deleted slot, so it survives.
    const remainingDeltas = (await loadVariableDeltas(ctx.db, chatId)).filter((e) => e.messageId === null || !messageIds.includes(e.messageId));
    statements.push(runtimeVariablesUpdateStatement(ctx.db, chatId, foldChain(remainingDeltas)));
    await ctx.db.batch(batchMany(statements));
    await emit({ type: "messagesDeleted", chatId, messageIds: [...messageIds] });
    // Best-effort audit after the destructive write lands: no phantom row for a refused delete.
    await ctx.audit(
      {
        actorUserId: principal.userId,
        action: "chat.deleteMessages",
        entityType: "chat",
        entityId: chatId,
        metadata: { messageIds: [...messageIds] },
      },
      now,
    );
  };
}

/** The re-sequence plan: parks the affected block above the canon head, then stamps each block member its
 *  final seq (reusing its own vacated seq slots). Null means no movement (already in position). */
interface ResequencePlan {
  readonly parkLo: number;
  readonly parkHi: number;
  readonly by: number;
  readonly assignments: readonly { readonly id: MessageId; readonly seq: number }[];
}

/** Computes the {@link ResequencePlan} for moving movingId so its seq becomes (clamped) toSeq. Only the
 *  contiguous block between the old and new position is permuted; existing seq values are reused. */
function planResequence(ordered: readonly { readonly id: MessageId; readonly seq: number }[], movingId: MessageId, toSeq: number): ResequencePlan | null {
  const moving = ordered.find((m) => m.id === movingId);
  if (moving === undefined) {
    return null;
  }
  const remaining = ordered.filter((m) => m.id !== movingId);
  // Moving down lands after the slot currently at toSeq; moving up lands before it. Clamped to the valid span.
  const movingDown = toSeq > moving.seq;
  let insertPos = remaining.filter((m) => (movingDown ? m.seq <= toSeq : m.seq < toSeq)).length;
  insertPos = Math.max(0, Math.min(insertPos, remaining.length));
  const newOrder = [...remaining.slice(0, insertPos), moving, ...remaining.slice(insertPos)];
  // The affected block = the contiguous index span where the order actually changed.
  let lo = 0;
  while (lo < ordered.length && ordered[lo]?.id === newOrder[lo]?.id) {
    lo += 1;
  }
  let hi = ordered.length - 1;
  while (hi >= 0 && ordered[hi]?.id === newOrder[hi]?.id) {
    hi -= 1;
  }
  if (lo > hi) {
    return null;
  }
  const maxSeq = ordered.at(-1)?.seq ?? 0;
  const slotSeqs = ordered.slice(lo, hi + 1).map((m) => m.seq);
  const assignments = newOrder.slice(lo, hi + 1).flatMap((m, i) => {
    const seq = slotSeqs[i];
    return seq !== undefined ? [{ id: m.id, seq }] : [];
  });
  // parkHi is the block's own last seq, not the chat maxSeq, since only the affected block is lifted +
  // re-stamped; by = maxSeq + 1 still parks the block strictly above every existing seq.
  return { parkLo: slotSeqs[0] ?? 0, parkHi: slotSeqs.at(-1) ?? 0, by: maxSeq + 1, assignments };
}

/** `moveMessage` — host-only. Reorders a slot to a new seq position via a parked, collision-free
 *  re-sequence. Emits messagesReordered. A no-op move emits nothing. */
function createMoveMessage(ctx: ChatContext, emit: EmitChatEvent): ChatService["moveMessage"] {
  return async ({ principal, chatId, messageId, toSeq }: MoveMessageParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    await loadSlotInChat(ctx, chatId, messageId);
    const ordered = await loadMessageSeqs(ctx.db, chatId);
    const plan = planResequence(ordered, messageId, toSeq);
    if (plan === null) {
      return;
    }
    // Maps each message to its post-move seq, then re-folds the selected-variant deltas through that
    // permutation so chats.runtime_variables reflects the new order.
    const newSeqById = new Map<MessageId, number>(ordered.map((m) => [m.id, m.seq]));
    for (const a of plan.assignments) {
      newSeqById.set(a.id, a.seq);
    }
    const deltas = await loadVariableDeltas(ctx.db, chatId);
    // A standalone (out-of-turn) delta (`messageId === null`) is not reordered — it keeps its stamped seq.
    const refolded = foldChain(deltas.map((e) => ({ seq: e.messageId === null ? e.seq : (newSeqById.get(e.messageId) ?? e.seq), delta: e.delta })));
    await ctx.db.batch(
      batchMany([
        shiftSeqRangeStatement(ctx.db, {
          chatId,
          lo: plan.parkLo,
          hi: plan.parkHi,
          by: plan.by,
        }),
        ...plan.assignments.map((a) => setMessageSeqStatement(ctx.db, a.id, a.seq)),
        runtimeVariablesUpdateStatement(ctx.db, chatId, refolded),
      ]),
    );
    await emit({ type: "messagesReordered", chatId });
  };
}

/** `duplicateMessage` — author-or-host. Copies the slot's attribution + its selected variant's content/
 *  economics to a fresh tail slot. Emits messageCommitted. */
function createDuplicateMessage(ctx: ChatContext, emit: EmitChatEvent): ChatService["duplicateMessage"] {
  return async ({ principal, chatId, messageId }: DuplicateMessageParams) => {
    const slot = await loadSlotInChat(ctx, chatId, messageId);
    const membership = await requireAuthorOrHost(ctx, principal, chatId, slot.authorUserId);
    const seq = (await loadMaxMessageSeq(ctx.db, chatId)) + 1;
    const params = {
      messageId: ctx.newMessageId(),
      variantId: ctx.newMessageVariantId(),
      chatId,
      seq,
      role: slot.role,
      authorUserId: slot.authorUserId,
      characterId: slot.characterId,
      personaId: slot.personaId,
      excludedFromPrompt: slot.excludedFromPrompt,
      now: ctx.now(),
      variant: {
        content: slot.content,
        reasoning: slot.reasoning,
        model: slot.model,
        provider: slot.provider,
        tokensIn: slot.tokensIn,
        tokensOut: slot.tokensOut,
        cacheReadTokens: slot.cacheReadTokens,
        cacheWriteTokens: slot.cacheWriteTokens,
        costUsd: slot.costUsd,
        contextWindow: slot.contextWindow,
        ttftMs: slot.ttftMs,
        finishReason: slot.finishReason,
        stopReason: slot.stopReason,
        terminalReason: slot.terminalReason,
      },
    };
    // The dup is a fresh single-variant tail slot whose economics are copied from the source's selected
    // variant, so a rebuild folds the copy too; mirrored live to keep live == rebuild.
    const statements = insertCanonMessageStatements(ctx.db, params);
    const ownerId = await resolveStatsOwner(ctx, chatId, principal.userId);
    ctx.applyStatsDelta(
      statements,
      ctx.db,
      canonMessageDelta({
        ownerId,
        sign: 1,
        now: params.now,
        row: {
          characterId: slot.characterId,
          role: slot.role,
          createdAt: params.now,
          content: slot.content,
          tokensIn: slot.tokensIn,
          tokensOut: slot.tokensOut,
          costUsd: slot.costUsd,
          cacheReadTokens: slot.cacheReadTokens,
          cacheWriteTokens: slot.cacheWriteTokens,
          contextWindow: slot.contextWindow,
          genStartedAt: null,
          genFinishedAt: null,
          model: slot.model,
          provider: slot.provider,
          reasoning: slot.reasoning,
          metadata: null,
          selectedIdx: 0,
          variantCount: 1,
        },
      }),
    );
    await ctx.db.batch(batchMany(statements));
    const view = buildCommittedMessageView(params);
    await emit({ type: "messageCommitted", chatId, messageId: view.id, view });
    void ctx.emitChatChanged(chatId);
    return await projectEditReturn(ctx, view, membership);
  };
}

/** `reattributeMessages` — host-only. Re-voices a set of slots to a characterId. Emits one messageEdited
 *  per slot. An empty set is a no-op. */
function createReattributeMessages(ctx: ChatContext, emit: EmitChatEvent): ChatService["reattributeMessages"] {
  return async ({ principal, chatId, messageIds, characterId }: ReattributeMessagesParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    if (messageIds.length === 0) {
      return;
    }
    const slots = await Promise.all(messageIds.map((id) => loadMessageView(ctx.db, id)));
    for (const slot of slots) {
      if (slot === undefined || slot.chatId !== chatId) {
        throw new ChatNotFoundError(chatId);
      }
    }
    await ctx.db.batch(batchMany([reattributeMessagesStatement(ctx.db, chatId, messageIds, characterId)]));
    const views = await Promise.all(messageIds.map((id) => loadMessageView(ctx.db, id)));
    await Promise.all(views.flatMap((view) => (view !== undefined ? [emit({ type: "messageEdited", chatId, messageId: view.id, view })] : [])));
  };
}

/** The `reattributePersona` SCOPE resolver: which slots the caller means. The `messages` arm is taken at its
 *  word (the verb's four belts then vet every id); the `mine` arm is resolved from the db by a predicate that
 *  can only ever yield the CALLER's own user rows in THIS chat — which is why the bulk arm needs no extra
 *  permission surface. Membership is already resolved by the caller. */
async function resolveReattributeTargets(ctx: ChatContext, chatId: ChatId, authorUserId: UserId, scope: ReattributeScope): Promise<readonly MessageId[]> {
  if (scope.kind === "messages") {
    return scope.messageIds;
  }
  return await loadAuthoredUserMessageIds(ctx.db, chatId, authorUserId, scope.fromSeq);
}

/** `reattributePersona` — author-or-host per targeted row. Re-stamps messages.personaId for a set of
 *  user-role slots. Four belts, all validated before any write: (a) belongs to chatId, (b) is a user row
 *  with a non-null author, (c) clears the per-slot author-or-host gate, and (d) targets a persona owned by
 *  that row's author. Emits one messageEdited per re-stamped slot. An empty set is a no-op.
 *
 *  The `mine` SCOPE arm resolves the id set server-side (`loadAuthoredUserMessageIds` — the caller's own user
 *  rows, optionally floored at a seq) and then runs the SAME four belts and the SAME stamp-only write: one
 *  path, so the bulk arm cannot drift from the per-row arm's guarantees. Its rows are the caller's own, so
 *  belt (c) is satisfied by construction — the arm widens REACH (past the client's old 100-message window),
 *  never AUTHORITY. Nothing else is touched: content stays raw (D51 — identity macros resolve live off the
 *  stamp), and rpg snapshots / memory digests / exports are not this verb's rows. */
function createReattributePersona(ctx: ChatContext, emit: EmitChatEvent): ChatService["reattributePersona"] {
  return async ({ principal, chatId, scope, personaId }: ReattributePersonaParams): Promise<void> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    const messageIds = await resolveReattributeTargets(ctx, chatId, principal.userId, scope);
    if (messageIds.length === 0) {
      return;
    }
    const slots = await Promise.all(messageIds.map((id) => loadMessageView(ctx.db, id)));
    // Belts (a)-(c), synchronous per slot; collect each row's author for the ownership belt (d) below.
    const authorIds: UserId[] = [];
    for (const slot of slots) {
      if (slot === undefined || slot.chatId !== chatId) {
        throw new ChatNotFoundError(chatId);
      }
      if (slot.role !== "user" || slot.authorUserId === null) {
        throw new ChatOperationError(CHAT_OP_CODES.notUserMessage, `chat ${chatId}: only a user message carries an authoring persona`);
      }
      assertAuthorOrHost(ctx.can, { principal, role: membership.role, authorUserId: slot.authorUserId }, chatId);
      authorIds.push(slot.authorUserId);
    }
    // Belt (d): the target persona must be owned by each targeted row's author, checked once per distinct author.
    const distinctAuthors = [...new Set(authorIds)];
    const ownership = await Promise.all(distinctAuthors.map((ownerId) => ctx.verifyPersonaOwned({ ownerId, personaId })));
    if (ownership.some((owned) => !owned)) {
      throw new ChatOperationError(CHAT_OP_CODES.notPersonaOwner, `chat ${chatId}: the target persona must be owned by the message author`);
    }
    await ctx.db.batch(batchMany([reattributePersonaStatement(ctx.db, chatId, messageIds, personaId)]));
    const views = await Promise.all(messageIds.map((id) => loadMessageView(ctx.db, id)));
    await Promise.all(views.flatMap((view) => (view !== undefined ? [emit({ type: "messageEdited", chatId, messageId: view.id, view })] : [])));
  };
}

/** The canon-edit verb bundle the composition root spreads into the full service. */
/** CLAIM-BEFORE-EDIT, applied once for the whole bundle (R0 F4(a) -- a hand-edited room is a room the
 *  user did something with, and losing it to the reaper is the worse failure).
 *
 *  WHY A WRAPPER and not a call inside each of the ten verbs: the ordering invariant needs the claim
 *  AFTER an authority check (a stranger must not be able to flip a room's visibility) and BEFORE the
 *  write (the claim replays the creation stats over the canon present at claim -- after the write, the
 *  edited row would be counted by both the replay and the verb's own diff delta). Ten separate
 *  insertions is ten chances to put one in the wrong place, and a verb added later gets none at all.
 *  So the wrapper runs the MINIMUM guard every edit verb shares -- present membership -- and then
 *  claims; each verb re-runs its own stricter author-or-host row check immediately after, unchanged.
 *  The costs, both accepted and deliberate: one extra membership read per edit, and a MEMBER whose
 *  edit is then refused by the stricter check still claimed the room (they are a member of it, acting
 *  in it -- not a leak, and not a class the reaper should have taken). */
function claiming<P extends { readonly principal: EditMessageParams["principal"]; readonly chatId: ChatId }, R>(
  ctx: ChatContext,
  claimChat: ClaimChatOp,
  verb: (params: P) => Promise<R>,
): (params: P) => Promise<R> {
  return async (params: P): Promise<R> => {
    await requireParticipant(ctx, params.principal, params.chatId);
    await claimChat(params.chatId);
    return await verb(params);
  };
}

export function createEdit(ctx: ChatContext, deps: EditDeps): EditVerbs {
  const { emit, claimChat } = deps;
  const claim = <P extends { readonly principal: EditMessageParams["principal"]; readonly chatId: ChatId }, R>(
    verb: (params: P) => Promise<R>,
  ): ((params: P) => Promise<R>) => claiming(ctx, claimChat, verb);
  return {
    selectVariant: claim(createSelectVariant(ctx, emit)),
    editMessage: claim(createEditMessage(ctx, deps)),
    setSeededGreeting: claim(createSetSeededGreeting(ctx, emit)),
    setMessageHidden: claim(createSetMessageHidden(ctx, emit)),
    deleteMessages: claim(createDeleteMessages(ctx, emit)),
    editReasoning: claim(createEditReasoning(ctx, emit)),
    clearReasoning: claim(createClearReasoning(ctx, emit)),
    moveMessage: claim(createMoveMessage(ctx, emit)),
    duplicateMessage: claim(createDuplicateMessage(ctx, emit)),
    reattributeMessages: claim(createReattributeMessages(ctx, emit)),
    reattributePersona: claim(createReattributePersona(ctx, emit)),
  };
}
