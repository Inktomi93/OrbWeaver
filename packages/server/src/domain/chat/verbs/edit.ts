// domain/chat/verbs/edit — the canon-EDIT verbs (the non-generation slot/variant mutations; D26). A message
// is a SLOT (`messages`) ⋈ its selected
// `message_variant`: an edit mutates the VARIANT content/reasoning (`editMessage`/`editReasoning`/
// `clearReasoning`) OR the SLOT's selection/attribution/hidden/seq (`selectVariant`/`setMessageHidden`/
// `reattributeMessages`/`moveMessage`/`deleteMessages`) — NEVER doubling content (D26 inv §15). Each verb:
// gate (`ctx.can` via the guard) → the D26-correct mutation → emit the room-public bus event → return the
// fresh `MessageView` (or void for the bulk mutators).
//
// AUTHORITY (substrate/auth/matrix): edit/delete a slot → `author-or-host`; reorder
// (`moveMessage`) + re-attribute → `host`. The bulk `deleteMessages` gates each target's author independently
// (the host clears any; a member clears only their own).
//
// EMIT SEAM: the chat bus is chat's own in-process collaborator (NOT on `ChatContext` — see bus.ts), so the
// bundle takes it as the SECOND factory arg, typed inline (`types-in-contract` forbids an exported emit type
// outside contract/). `setMessageHidden` emits the dedicated `messageHidden` member (PD-86); FLAG
// [reattribute-carrier]: `reattributeMessages` deliberately emits one `messageEdited` per slot (each with
// its fresh view) — an attribution re-stamp IS a slot edit, so the existing carrier is the precise one (no
// `messageReattributed` member).
// FLAG[dup-snapshot]: `duplicateMessage` copies the selected variant's content + economics from the
// `MessageView`; `params`/`promptSnapshot` (D26 — not on the view) are NOT carried onto the copy (a duplicate
// is a fresh slot, the per-turn provenance need not follow).

import type { ChatBusEvent, MessageView } from "@orb/contracts/chat";
import { batchMany } from "@orb/db/kit";
import type { CharacterId, ChatId, MessageId } from "@orb/kit/ids";
import { stripSelfSpeakerLabel } from "@orb/kit/speaker-label";
import type { ChatContext } from "../contract/context";
import { ChatNotFoundError } from "../contract/errors";
import type {
  ClearReasoningParams,
  DeleteMessagesParams,
  DuplicateMessageParams,
  EditMessageParams,
  EditReasoningParams,
  MoveMessageParams,
  ReattributeMessagesParams,
  SelectVariantParams,
  SetMessageHiddenParams,
} from "../contract/params";
import type { ChatService } from "../contract/service";
import { requireAuthorOrHost, requireHost, requireParticipant } from "../guard";
import {
  buildCommittedMessageView,
  deleteMessagesStatement,
  editMessageContentStatements,
  editReasoningStatements,
  insertCanonMessageStatements,
  reattributeMessagesStatement,
  selectActiveVariantStatement,
  setMessageHiddenStatement,
  setMessageSeqStatement,
  shiftSeqRangeStatement,
} from "../persistence/canon-write";
import {
  loadCanonStatRows,
  loadMaxMessageSeq,
  loadMessageSeqs,
  loadMessageView,
  loadSwipeStatRows,
  loadVariableDeltas,
  loadVariantDelta,
  loadVariantMessageId,
} from "../persistence/queries";
import { loadRoster } from "../persistence/roster";
import { assertAuthorOrHost } from "../substrate/auth";
import { foldChain, runtimeVariablesUpdateStatement } from "../substrate/runtime-variables";
import { canonMessageDelta, editMessageDelta, swipeVariantDelta } from "../substrate/stats-delta";

/** The emit op the edit verbs close over (inlined — the file header `types-in-contract` note). */
type EmitChatEvent = (event: ChatBusEvent) => Promise<void>;

/** The collaborators not on `ChatContext` (the second factory arg — the roster.ts/turn.ts precedent). */
interface EditDeps {
  readonly emit: EmitChatEvent;
}

/** The canon-edit slice of `ChatService` this grouped file owns (the bundle the root spreads in). */
type EditVerbs = Pick<
  ChatService,
  | "selectVariant"
  | "editMessage"
  | "setMessageHidden"
  | "deleteMessages"
  | "editReasoning"
  | "clearReasoning"
  | "moveMessage"
  | "duplicateMessage"
  | "reattributeMessages"
>;

/** Load a slot ⋈ its selected variant AND verify it belongs to `chatId` — a missing slot OR a foreign-chat
 *  slot collapses to one leak-free `ChatNotFoundError` (so a member can't probe another room's message ids). */
async function loadSlotInChat(
  ctx: ChatContext,
  chatId: ChatId,
  messageId: MessageId,
): Promise<MessageView> {
  const view = await loadMessageView(ctx.db, messageId);
  if (view === undefined || view.chatId !== chatId) {
    throw new ChatNotFoundError(chatId);
  }
  return view;
}

/** Re-read a slot's `MessageView` after a write (the authoritative content/idx/variantCount the mutation
 *  produced). A racing delete (`undefined`) surfaces as a leak-free `ChatNotFoundError`. */
async function reloadSlot(
  ctx: ChatContext,
  chatId: ChatId,
  messageId: MessageId,
): Promise<MessageView> {
  const view = await loadMessageView(ctx.db, messageId);
  if (view === undefined) {
    throw new ChatNotFoundError(chatId);
  }
  return view;
}

/** Resolve the speaking character's name for the canon-purity strip (the trusted `Name:` label is
 *  out-of-band; a manual edit must not bake a leaked self-label into canon). The card reads under the room
 *  HOST's ownership (D28/D16); a hostless room / null card degrades to `""` (the strip becomes a tag-only
 *  no-op — never an error, never a wrong-name strip). */
async function resolveSpeakerName(
  ctx: ChatContext,
  chatId: ChatId,
  characterId: CharacterId,
): Promise<string> {
  const roster = await loadRoster(ctx.db, chatId);
  const hostUserId = roster.find((r) => r.role === "host" && r.userId !== null)?.userId ?? null;
  if (hostUserId === null) {
    return "";
  }
  const card = await ctx.getCard({ ownerId: hostUserId, characterId });
  return card?.name ?? "";
}

/** The D26 canon-purity strip at persist: a per-speaker assistant edit drops a leaked leading
 *  `<speaker>`/`Name:` self-label so stored canon stays the spoken text only. Applied ONLY to a character-
 *  voiced slot; a user/system row (no `characterId`) keeps its content verbatim. */
async function purifyEditedContent(
  ctx: ChatContext,
  chatId: ChatId,
  slot: MessageView,
  content: string,
): Promise<string> {
  if (slot.characterId === null) {
    return content;
  }
  const name = await resolveSpeakerName(ctx, chatId, slot.characterId);
  return stripSelfSpeakerLabel(content, name);
}

/** The stats OWNER for a canon mutation — the room HOST (D19: the host's box funds/owns the canon; the
 *  rebuild attributes by the host-owned characters' chats — PD-21 confirmed: the two agree under the
 *  enforced host-owned-roster invariant). A
 *  hostless room (archived orphan) degrades to the acting caller so the delta is never dropped. */
async function resolveStatsOwner(
  ctx: ChatContext,
  chatId: ChatId,
  fallback: MessageView["authorUserId"] & {},
): Promise<NonNullable<MessageView["authorUserId"]>> {
  const roster = await loadRoster(ctx.db, chatId);
  return roster.find((r) => r.role === "host" && r.userId !== null)?.userId ?? fallback;
}

// ── selectVariant (D26 — flip the slot's selected-variant pointer to a SIBLING swipe; zero copy) ─────────────
/** `selectVariant` — author-or-host. Flip `messages.selectedVariantId` to a sibling swipe (a pointer move,
 *  never a content copy — D26). The variant MUST belong to the slot (the ownership belt) else a leak-free
 *  NOT_FOUND. Emits `variantSelected`. */
function createSelectVariant(ctx: ChatContext, emit: EmitChatEvent): ChatService["selectVariant"] {
  return async ({ principal, chatId, messageId, variantId }: SelectVariantParams) => {
    const slot = await loadSlotInChat(ctx, chatId, messageId);
    await requireAuthorOrHost(ctx, principal, chatId, slot.authorUserId);
    const owner = await loadVariantMessageId(ctx.db, variantId);
    if (owner !== messageId) {
      throw new ChatNotFoundError(chatId);
    }
    // D46 THE swipe-clobber fix (ST #3263): re-fold `chats.runtime_variables` for the NEW pointer in the SAME
    // batch as the flip. The newly-selected variant's delta replaces this slot's contribution; every other slot
    // keeps its committed selection — so a swipe to a variant that never set X rewinds X (derive-don't-stamp).
    const [currentDeltas, newDelta] = await Promise.all([
      loadVariableDeltas(ctx.db, chatId),
      loadVariantDelta(ctx.db, variantId),
    ]);
    const postEntries = currentDeltas.map((e) =>
      e.messageId === messageId ? { seq: e.seq, delta: newDelta } : e,
    );
    await ctx.db.batch(
      batchMany([
        selectActiveVariantStatement(ctx.db, messageId, variantId),
        runtimeVariablesUpdateStatement(ctx.db, chatId, foldChain(postEntries)),
      ]),
    );
    const view = await reloadSlot(ctx, chatId, messageId);
    await emit({ type: "variantSelected", chatId, messageId, view });
    return view;
  };
}

// ── editMessage (D26 — mutate the SELECTED variant's content; the slot is unchanged) ─────────────────────────
/** `editMessage` — author-or-host. Overwrite the SELECTED variant's content in place (D26 — never doubles
 *  content) + stamp `editedAt`; the per-speaker canon-purity strip runs first. Emits `messageEdited`.
 *  FLAG[PD-110]: `runOnEdit` regex-on-edit is unwired here — only `purifyEditedContent` (the self-label
 *  strip) runs before the verbatim write; the edited content never re-applies a `runOnEdit` regex. */
function createEditMessage(ctx: ChatContext, emit: EmitChatEvent): ChatService["editMessage"] {
  return async ({ principal, chatId, messageId, content }: EditMessageParams) => {
    const slot = await loadSlotInChat(ctx, chatId, messageId);
    await requireAuthorOrHost(ctx, principal, chatId, slot.authorUserId);
    const clean = await purifyEditedContent(ctx, chatId, slot, content);
    const now = ctx.now();
    const statements = editMessageContentStatements(ctx.db, {
      messageId,
      variantId: slot.selectedVariantId,
      content: clean,
      editedAt: now,
    });
    // The canon-mutator stats push: the NET word/byte change rides the SAME batch as the edit
    // (bucketed on the slot's ORIGINAL day — the rebuild folds by createdAt). Owner = the room host (D19).
    ctx.applyStatsDelta(
      statements,
      ctx.db,
      editMessageDelta({
        ownerId: await resolveStatsOwner(ctx, chatId, principal.userId),
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
    await emit({ type: "messageEdited", chatId, messageId, view });
    return view;
  };
}

// ── setMessageHidden (D26 — toggle the SLOT's excludedFromPrompt; the row survives) ──────────────────────────
/** `setMessageHidden` — author-or-host. Hold the slot out of assembly (or restore it) — a pure slot-flag
 *  write, no content change. Emits the dedicated `messageHidden` event (the fresh view carries the flag). */
function createSetMessageHidden(
  ctx: ChatContext,
  emit: EmitChatEvent,
): ChatService["setMessageHidden"] {
  return async ({ principal, chatId, messageId, hidden }: SetMessageHiddenParams) => {
    const slot = await loadSlotInChat(ctx, chatId, messageId);
    await requireAuthorOrHost(ctx, principal, chatId, slot.authorUserId);
    await ctx.db.batch(batchMany([setMessageHiddenStatement(ctx.db, messageId, hidden)]));
    const view = await reloadSlot(ctx, chatId, messageId);
    await emit({ type: "messageHidden", chatId, messageId, view });
    return view;
  };
}

// ── editReasoning / clearReasoning (D26 — the variant's reasoning sibling column) ────────────────────────────
/** Write the SELECTED variant's reasoning (text or null) + stamp `editedAt`. Shared by edit/clear. */
async function writeReasoning(
  ctx: ChatContext,
  emit: EmitChatEvent,
  args: {
    readonly chatId: ChatId;
    readonly messageId: MessageId;
    readonly variantId: MessageView["selectedVariantId"];
    readonly reasoning: string | null;
    readonly event: "reasoningEdited" | "reasoningCleared";
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
  return view;
}

/** `editReasoning` — author-or-host. Overwrite the selected variant's reasoning text. Emits `reasoningEdited`. */
function createEditReasoning(ctx: ChatContext, emit: EmitChatEvent): ChatService["editReasoning"] {
  return async ({ principal, chatId, messageId, reasoning }: EditReasoningParams) => {
    const slot = await loadSlotInChat(ctx, chatId, messageId);
    await requireAuthorOrHost(ctx, principal, chatId, slot.authorUserId);
    return await writeReasoning(ctx, emit, {
      chatId,
      messageId,
      variantId: slot.selectedVariantId,
      reasoning,
      event: "reasoningEdited",
    });
  };
}

/** `clearReasoning` — author-or-host. Null the selected variant's reasoning. Emits `reasoningCleared`. */
function createClearReasoning(
  ctx: ChatContext,
  emit: EmitChatEvent,
): ChatService["clearReasoning"] {
  return async ({ principal, chatId, messageId }: ClearReasoningParams) => {
    const slot = await loadSlotInChat(ctx, chatId, messageId);
    await requireAuthorOrHost(ctx, principal, chatId, slot.authorUserId);
    return await writeReasoning(ctx, emit, {
      chatId,
      messageId,
      variantId: slot.selectedVariantId,
      reasoning: null,
      event: "reasoningCleared",
    });
  };
}

// ── deleteMessages (bulk; author-or-host per slot — the host clears any, a member only their own) ────────────
/** `deleteMessages` — gate EACH target's author independently (member floor + per-slot author-or-host), then
 *  delete the set (the variants CASCADE — D26). Emits `messagesDeleted`. An empty set is an idempotent no-op. */
function createDeleteMessages(
  ctx: ChatContext,
  emit: EmitChatEvent,
): ChatService["deleteMessages"] {
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
      assertAuthorOrHost(
        ctx.can,
        { principal, role: membership.role, authorUserId: slot.authorUserId },
        chatId,
      );
    }
    // The canon-mutator stats push (the neo delete precedent): each removed slot's SELECTED-
    // variant contribution + each of its NON-selected swipes are subtracted (sign −1 — the exact negative
    // of the rebuild's fold) in the SAME batch as the delete. Rows are read BEFORE the delete lands.
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
    // D46: re-fold `chats.runtime_variables` over the chain MINUS the deleted slots (their deltas no longer
    // apply), in the SAME batch as the delete.
    const remainingDeltas = (await loadVariableDeltas(ctx.db, chatId)).filter(
      (e) => !messageIds.includes(e.messageId),
    );
    statements.push(runtimeVariablesUpdateStatement(ctx.db, chatId, foldChain(remainingDeltas)));
    await ctx.db.batch(batchMany(statements));
    await emit({ type: "messagesDeleted", chatId, messageIds: [...messageIds] });
    // Best-effort audit AFTER the destructive write lands (existence-before-audit order: no phantom row for a refused
    // delete; a failed audit never breaks the primary channel — foundation logAudit contract).
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

// ── moveMessage (host — re-stamp canon ORDER; the minimal-disruption range re-sequence) ──────────────────────
/** The re-sequence plan: PARK the affected block above the canon head (a uniform shift, collision-free), then
 *  stamp each block member its final seq (a value from the block's own vacated seq slots — gaps + the rest of
 *  the canon untouched). `null` ⇒ no movement (already in position). */
interface ResequencePlan {
  readonly parkLo: number;
  readonly parkHi: number;
  readonly by: number;
  readonly assignments: readonly { readonly id: MessageId; readonly seq: number }[];
}

/** Compute the {@link ResequencePlan} for moving `movingId` so its seq becomes (clamped) `toSeq`. Only the
 *  contiguous block of slots BETWEEN the old and new position is permuted; their existing seq VALUES are
 *  reused (so `messages.seq` stays gap-stable and `maxSeq` is unchanged outside the block). */
function planResequence(
  ordered: readonly { readonly id: MessageId; readonly seq: number }[],
  movingId: MessageId,
  toSeq: number,
): ResequencePlan | null {
  const moving = ordered.find((m) => m.id === movingId);
  if (moving === undefined) {
    return null;
  }
  const remaining = ordered.filter((m) => m.id !== movingId);
  // Insert position among the OTHER slots so the moved slot LANDS at `toSeq`. The direction off-by-one: moving
  // DOWN (toSeq > current) lands AFTER the slot currently at `toSeq` (count `<= toSeq`); moving UP lands BEFORE
  // it (count `< toSeq`). Clamped to the valid span.
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
    return m !== undefined && seq !== undefined ? [{ id: m.id, seq }] : [];
  });
  return { parkLo: slotSeqs[0] ?? 0, parkHi: maxSeq, by: maxSeq + 1, assignments };
}

/** `moveMessage` — host-only. Reorder a slot to a new seq position (re-stamps canon order via a parked,
 *  collision-free re-sequence). Emits `messagesReordered`. A no-op move (already in position) emits nothing.
 *  FLAG[move-vs-horizon]: the membership join/leave horizons (`chat_participants.joinSeq`/`leftSeq`) reference
 *  `messages.seq` (Part III §1) — a reorder permutes seq within the affected block, which the doc does NOT
 *  reconcile against the horizon. This re-sequence reuses the block's OWN seq values (no global renumber), so
 *  the disturbance is minimal, but the precise reorder↔horizon contract is unspecified → doc owns it. */
function createMoveMessage(ctx: ChatContext, emit: EmitChatEvent): ChatService["moveMessage"] {
  return async ({ principal, chatId, messageId, toSeq }: MoveMessageParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    await loadSlotInChat(ctx, chatId, messageId);
    const ordered = await loadMessageSeqs(ctx.db, chatId);
    const plan = planResequence(ordered, messageId, toSeq);
    if (plan === null) {
      return;
    }
    await ctx.db.batch(
      batchMany([
        shiftSeqRangeStatement(ctx.db, {
          chatId,
          lo: plan.parkLo,
          hi: plan.parkHi,
          by: plan.by,
        }),
        ...plan.assignments.map((a) => setMessageSeqStatement(ctx.db, a.id, a.seq)),
      ]),
    );
    await emit({ type: "messagesReordered", chatId });
  };
}

// ── duplicateMessage (D26 — copy a slot + its selected variant to a new tail slot) ───────────────────────────
/** `duplicateMessage` — author-or-host. Copy the slot's attribution + its SELECTED variant's content/economics
 *  to a fresh tail slot (D26 3-step commit). Emits `messageCommitted`. FLAG[dup-snapshot]: `params`/
 *  `promptSnapshot` are not carried (not on the `MessageView`). */
function createDuplicateMessage(
  ctx: ChatContext,
  emit: EmitChatEvent,
): ChatService["duplicateMessage"] {
  return async ({ principal, chatId, messageId }: DuplicateMessageParams) => {
    const slot = await loadSlotInChat(ctx, chatId, messageId);
    await requireAuthorOrHost(ctx, principal, chatId, slot.authorUserId);
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
    await ctx.db.batch(batchMany(insertCanonMessageStatements(ctx.db, params)));
    const view = buildCommittedMessageView(params);
    await emit({ type: "messageCommitted", chatId, messageId: view.id, view });
    return view;
  };
}

// ── reattributeMessages (host — re-stamp the characterId attribution of a set of slots) ──────────────────────
/** `reattributeMessages` — host-only. Re-voice a set of slots to a `characterId` (D26 slot-level attribution;
 *  the self-heal hash-diff). Emits one `messageEdited` per slot (each carries its fresh view; FLAG
 *  [reattribute-carrier] — a deliberate carrier choice, see the file header). An empty set is a no-op. */
function createReattributeMessages(
  ctx: ChatContext,
  emit: EmitChatEvent,
): ChatService["reattributeMessages"] {
  return async ({
    principal,
    chatId,
    messageIds,
    characterId,
  }: ReattributeMessagesParams): Promise<void> => {
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
    await ctx.db.batch(
      batchMany([reattributeMessagesStatement(ctx.db, chatId, messageIds, characterId)]),
    );
    // Re-read each re-voiced slot's fresh view, then fan the per-slot `messageEdited` (one carrier per slot).
    const views = await Promise.all(messageIds.map((id) => loadMessageView(ctx.db, id)));
    await Promise.all(
      views.flatMap((view) =>
        view !== undefined
          ? [emit({ type: "messageEdited", chatId, messageId: view.id, view })]
          : [],
      ),
    );
  };
}

/**
 * The canon-edit verb BUNDLE (the grouped-file `create<File>` convention — `verb-naming` gate). Folds the
 * per-verb factories into one object keyed by their `ChatService` method names; the composition root spreads
 * it into the full service. `deps` carries the chat bus `emit` (chat's own collaborator — see bus.ts).
 */
export function createEdit(ctx: ChatContext, deps: EditDeps): EditVerbs {
  const { emit } = deps;
  return {
    selectVariant: createSelectVariant(ctx, emit),
    editMessage: createEditMessage(ctx, emit),
    setMessageHidden: createSetMessageHidden(ctx, emit),
    deleteMessages: createDeleteMessages(ctx, emit),
    editReasoning: createEditReasoning(ctx, emit),
    clearReasoning: createClearReasoning(ctx, emit),
    moveMessage: createMoveMessage(ctx, emit),
    duplicateMessage: createDuplicateMessage(ctx, emit),
    reattributeMessages: createReattributeMessages(ctx, emit),
  };
}
