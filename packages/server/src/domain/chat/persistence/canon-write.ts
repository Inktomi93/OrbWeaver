// domain/chat/persistence/canon-write — the production canon writer, the explicit named exception to
// "persistence is queries only": it builds the INSERT/UPDATE statements that commit a message slot + its
// variants. Every statement is a `BatchStmt` the engine commits atomically in one `db.batch`.
//
// The 3-step dance (the circular FK: `messages.selectedVariantId → message_variants.id` and
// `message_variants.messageId → messages.id`): insert the slot with a null pointer, insert the first
// variant, then update the slot's pointer to it. FK-safe in emitted order.
//
// Determinism: every id, `seq`, and `createdAt` is caller-stamped — no ambient mint.
//
// No `loadCanonHistory`-style read here: a fresh insert's `MessageView` is fully known from the stamped
// inputs, so {@link buildCommittedMessageView} reconstructs it instead of a round-trip.

import type { AssembledPrompt, MessageView, ToolCallRecord, TurnInitiator } from "@orb/contracts/chat";
import type { UserIntent } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { messageAssets, messages, messageVariants } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchStmt } from "@orb/db/kit";
import type { AssetId, CharacterId, ChatId, MessageAssetId, MessageId, MessageVariantId, PersonaId, UserId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import type { MessageRole } from "@orb/kit/message-role";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";

/** The generation record for one `message_variants` row: all content + economics + the per-swipe snapshot.
 *  Every field but `content` is optional — an unreported economics field stays absent. */
interface CanonVariantInput {
  readonly content: string;
  readonly reasoning?: string | null | undefined;
  readonly model?: string | null | undefined;
  readonly provider?: string | null | undefined;
  readonly tokensIn?: number | null | undefined;
  readonly tokensOut?: number | null | undefined;
  readonly cacheReadTokens?: number | null | undefined;
  readonly cacheWriteTokens?: number | null | undefined;
  readonly costUsd?: number | null | undefined;
  readonly contextWindow?: number | null | undefined;
  /** The output cap the backend echoed + the requested reasoning effort. */
  readonly maxOutputTokens?: number | null | undefined;
  readonly reasoningEffort?: string | null | undefined;
  /** The fit-pass boundary — the earliest message actually included in the assembled history this
   *  generation. Null ⇒ nothing was dropped / the fit-pass never ran. */
  readonly contextBoundaryMessageId?: MessageId | null | undefined;
  /** The generation window bounds (epoch-ms) the engine stamps around the pipeline. Persistence-only
   *  columns (not on the read `MessageView`); absent ⇒ null (a verbatim/greeting seed). */
  readonly genStartedAt?: number | null | undefined;
  readonly genFinishedAt?: number | null | undefined;
  /** The upstream OpenRouter generation handle (`gen-…`) this variant billed under — the PD-137 cost key.
   *  Absent/null on a non-OR turn (agent-sdk / responses api / user-authored row). */
  readonly generationId?: string | null | undefined;
  readonly ttftMs?: number | null | undefined;
  readonly finishReason?: string | null | undefined;
  readonly stopReason?: string | null | undefined;
  readonly terminalReason?: string | null | undefined;
  readonly params?: UserIntent | null | undefined;
  readonly promptSnapshot?: AssembledPrompt | null | undefined;
  /** The ordered variable ops this variant applied (the turn's macro op-log). Absent/[] ⇒ no variable
   *  mutations; persisted as-is and folded into `chats.runtime_variables`. */
  readonly variableDelta?: readonly VarOp[] | null | undefined;
  /** The turn's cumulative tool exchange (emission/execution order across every recursion depth).
   *  Null/absent ⇒ a tool-less turn (never []). */
  readonly toolCalls?: readonly ToolCallRecord[] | null | undefined;
}

/** The slot attribution (slot-level; a swipe never re-voices). All nullable per role. */
interface CanonSlotAttribution {
  readonly authorUserId?: UserId | null | undefined;
  readonly characterId?: CharacterId | null | undefined;
  readonly personaId?: PersonaId | null | undefined;
}

/** The full input to commit ONE fresh message (slot + its first variant). */
interface InsertCanonMessageParams extends CanonSlotAttribution {
  readonly messageId: MessageId;
  readonly variantId: MessageVariantId;
  readonly chatId: ChatId;
  readonly seq: number;
  readonly role: MessageRole;
  readonly excludedFromPrompt?: boolean | undefined;
  /** The turn's origin (automation-design/03 §4) — stamped on the reply SLOT. Absent ⇒ the DB defaults
   *  (`'human'`/0), so every human/character writer stays byte-identical; only an automation-initiated
   *  new-slot turn passes these through. */
  readonly initiator?: TurnInitiator | undefined;
  readonly automationDepth?: number | undefined;
  readonly now: number;
  readonly variant: CanonVariantInput;
}

/** The economics fields shared by the `message_variants` insert AND the `MessageView` read-model — one
 *  home so the committed view can't drift from the persisted row. */
interface VariantEconomics {
  readonly content: string;
  readonly reasoning: string | null;
  readonly model: string | null;
  readonly provider: string | null;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly cacheReadTokens: number | null;
  readonly cacheWriteTokens: number | null;
  readonly costUsd: number | null;
  readonly contextWindow: number | null;
  readonly contextBoundaryMessageId: MessageId | null;
  readonly ttftMs: number | null;
  readonly finishReason: string | null;
  readonly stopReason: string | null;
  readonly terminalReason: string | null;
  /** Gen-window bounds (epoch-ms) — the stats gen-time axis and (PD-130) the `showGenerationTimer` chip
   *  both read `gf − gs`. A continue re-stamps them to the continuation's window. */
  readonly genStartedAt: number | null;
  readonly genFinishedAt: number | null;
  /** The upstream OpenRouter generation handle (`gen-…`) — the PD-137 per-message cost key. On both the
   *  insert columns and the read `MessageView` (one home; the committed view can't drift from the row). */
  readonly generationId: string | null;
}

/** Normalize a {@link CanonVariantInput}'s economics to the read-seam null contract. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a flat one-field-per-column `?? null` normalize — every operator is one independent coalesce, zero nesting/branching; splitting it would scatter the one-home economics shape (same posture as `canonMessageDelta` above).
function variantEconomics(v: CanonVariantInput): VariantEconomics {
  return {
    content: v.content,
    reasoning: v.reasoning ?? null,
    model: v.model ?? null,
    provider: v.provider ?? null,
    tokensIn: v.tokensIn ?? null,
    tokensOut: v.tokensOut ?? null,
    cacheReadTokens: v.cacheReadTokens ?? null,
    cacheWriteTokens: v.cacheWriteTokens ?? null,
    costUsd: v.costUsd ?? null,
    contextWindow: v.contextWindow ?? null,
    contextBoundaryMessageId: v.contextBoundaryMessageId ?? null,
    ttftMs: v.ttftMs ?? null,
    finishReason: v.finishReason ?? null,
    stopReason: v.stopReason ?? null,
    terminalReason: v.terminalReason ?? null,
    genStartedAt: v.genStartedAt ?? null,
    genFinishedAt: v.genFinishedAt ?? null,
    generationId: v.generationId ?? null,
  };
}

/** Map a variant payload → the `message_variants` insert columns. */
function variantColumns(args: {
  readonly variantId: MessageVariantId;
  readonly messageId: MessageId;
  readonly idx: number;
  readonly now: number;
  readonly variant: CanonVariantInput;
}): typeof messageVariants.$inferInsert {
  return {
    id: args.variantId,
    messageId: args.messageId,
    idx: args.idx,
    ...variantEconomics(args.variant),
    maxOutputTokens: args.variant.maxOutputTokens ?? null,
    reasoningEffort: args.variant.reasoningEffort ?? null,
    params: args.variant.params ?? null,
    promptSnapshot: args.variant.promptSnapshot ?? null,
    variableDelta: args.variant.variableDelta ?? null,
    toolCalls: args.variant.toolCalls ?? null,
    createdAt: args.now,
  };
}

/**
 * The 3-step dance as a batch fragment: [insert slot (pointer null), insert variant idx 0, set pointer].
 * The engine concatenates this with the stats-delta statements and commits one `db.batch` — atomic. The
 * statements must execute in this order.
 */
export function insertCanonMessageStatements(db: Db, params: InsertCanonMessageParams): BatchStmt[] {
  return [
    batchStmt(
      db.insert(messages).values({
        id: params.messageId,
        chatId: params.chatId,
        seq: params.seq,
        role: params.role,
        authorUserId: params.authorUserId ?? null,
        characterId: params.characterId ?? null,
        personaId: params.personaId ?? null,
        selectedVariantId: null,
        excludedFromPrompt: params.excludedFromPrompt ?? false,
        // Origin (03 §4) — omitted stays the DB default ('human'/0), so a human/character commit is
        // byte-identical; an automation new-slot turn threads its initiator + cascade depth.
        ...(params.initiator !== undefined ? { initiator: params.initiator } : {}),
        ...(params.automationDepth !== undefined ? { automationDepth: params.automationDepth } : {}),
        createdAt: params.now,
      }),
    ),
    batchStmt(
      db.insert(messageVariants).values(
        variantColumns({
          variantId: params.variantId,
          messageId: params.messageId,
          idx: 0,
          now: params.now,
          variant: params.variant,
        }),
      ),
    ),
    batchStmt(db.update(messages).set({ selectedVariantId: params.variantId }).where(eq(messages.id, params.messageId))),
  ];
}

/** The `message_assets` retaining rows for a message's inline attachments (one per attached asset) —
 *  what the asset-ref registry sees for GC, since the body's `asset:<id>` refs are invisible text.
 *  Committed in the same atomic batch as the message slot + variant. Empty ids ⇒ no statements. */
export function insertMessageAssetStatements(
  db: Db,
  params: {
    readonly rows: readonly {
      readonly id: MessageAssetId;
      readonly messageId: MessageId;
      readonly assetId: AssetId;
    }[];
    readonly now: number;
  },
): BatchStmt[] {
  return params.rows.map((r) =>
    batchStmt(
      db.insert(messageAssets).values({
        id: r.id,
        messageId: r.messageId,
        assetId: r.assetId,
        createdAt: params.now,
      }),
    ),
  );
}

/** The pointer flip (`selectVariant` — a zero-copy pointer move to a sibling swipe, never a content copy).
 *  The caller verifies the variant belongs to the slot. */
export function selectActiveVariantStatement(db: Db, messageId: MessageId, variantId: MessageVariantId): BatchStmt {
  return batchStmt(db.update(messages).set({ selectedVariantId: variantId }).where(eq(messages.id, messageId)));
}

/** Append a fresh variant to an existing slot (a swipe/regen reroll — the slot is unchanged, a new
 *  generation is added) at `idx`, and (default) flip the slot's `selectedVariantId` to it. */
export function appendVariantStatements(
  db: Db,
  params: {
    readonly messageId: MessageId;
    readonly variantId: MessageVariantId;
    readonly idx: number;
    readonly now: number;
    readonly variant: CanonVariantInput;
    readonly selectActive?: boolean | undefined;
  },
): BatchStmt[] {
  const stmts: BatchStmt[] = [
    batchStmt(
      db.insert(messageVariants).values(
        variantColumns({
          variantId: params.variantId,
          messageId: params.messageId,
          idx: params.idx,
          now: params.now,
          variant: params.variant,
        }),
      ),
    ),
  ];
  if (params.selectActive !== false) {
    stmts.push(selectActiveVariantStatement(db, params.messageId, params.variantId));
  }
  return stmts;
}

/**
 * Continue-in-place: extend an existing variant's content + record the undo snapshot. One update of the
 * slot's selected variant — `content`/`reasoning`/economics become the new generation; `preContinue*`
 * snapshots the pre-continuation state (what `undoContinue` restores) and `lastContinuation*` records the
 * appended continuation (what `revertContinue` re-applies). `idx`/`createdAt` are untouched.
 */
export function continueVariantStatements(
  db: Db,
  params: {
    readonly variantId: MessageVariantId;
    /** The NEW full variant (merged content + the continuation's economics). */
    readonly variant: CanonVariantInput;
    readonly preContinueContent: string;
    readonly preContinueReasoning: string | null;
    readonly lastContinuationContent: string;
    readonly lastContinuationReasoning: string | null;
  },
): BatchStmt[] {
  return [
    batchStmt(
      db
        .update(messageVariants)
        .set({
          // A continue re-generates: `variantEconomics` re-stamps the gen window to the continuation's.
          ...variantEconomics(params.variant),
          params: params.variant.params ?? null,
          promptSnapshot: params.variant.promptSnapshot ?? null,
          // A continue re-runs assembly, so its op-log replaces this variant's delta.
          variableDelta: params.variant.variableDelta ?? null,
          toolCalls: params.variant.toolCalls ?? null,
          preContinueContent: params.preContinueContent,
          preContinueReasoning: params.preContinueReasoning,
          lastContinuationContent: params.lastContinuationContent,
          lastContinuationReasoning: params.lastContinuationReasoning,
        })
        .where(eq(messageVariants.id, params.variantId)),
    ),
  ];
}

/** Set a variant's `content`/`reasoning` directly (the `undoContinue`/`revertContinue` restore — a
 *  pointer-free content swap from the `preContinue*`/`lastContinuation*` snapshot). The economics/snapshot
 *  columns are untouched so a restore is reversible by its twin. */
export function setVariantContentStatement(db: Db, variantId: MessageVariantId, content: string, reasoning: string | null): BatchStmt {
  return batchStmt(db.update(messageVariants).set({ content, reasoning }).where(eq(messageVariants.id, variantId)));
}

/** Merge a base + a continuation text/reasoning (continue/revert): null only when both are null, else the
 *  concatenation. One home (engine + verbs both fold continue state through this). */
export function combineReasoning(base: string | null, addition: string | null): string | null {
  if (base === null && addition === null) {
    return null;
  }
  return (base ?? "") + (addition ?? "");
}

/** Edit the selected variant's content in place (`editMessage`; the edit mutates the variant, never
 *  doubles content) and stamp `messages.editedAt`. Two statements (variant + slot). */
export function editMessageContentStatements(
  db: Db,
  params: {
    readonly messageId: MessageId;
    readonly variantId: MessageVariantId;
    readonly content: string;
    readonly editedAt: number;
  },
): BatchStmt[] {
  return [
    batchStmt(db.update(messageVariants).set({ content: params.content }).where(eq(messageVariants.id, params.variantId))),
    batchStmt(db.update(messages).set({ editedAt: params.editedAt }).where(eq(messages.id, params.messageId))),
  ];
}

/** Set the selected variant's reasoning (`editReasoning` writes text, `clearReasoning` writes null) and
 *  stamp `messages.editedAt`. The content is untouched. */
export function editReasoningStatements(
  db: Db,
  params: {
    readonly messageId: MessageId;
    readonly variantId: MessageVariantId;
    readonly reasoning: string | null;
    readonly editedAt: number;
  },
): BatchStmt[] {
  return [
    batchStmt(db.update(messageVariants).set({ reasoning: params.reasoning }).where(eq(messageVariants.id, params.variantId))),
    batchStmt(db.update(messages).set({ editedAt: params.editedAt }).where(eq(messages.id, params.messageId))),
  ];
}

/** Toggle a slot's `excludedFromPrompt` (`setMessageHidden`; the row survives, held out of assembly). A
 *  pure slot-flag write. */
export function setMessageHiddenStatement(db: Db, messageId: MessageId, hidden: boolean): BatchStmt {
  return batchStmt(db.update(messages).set({ excludedFromPrompt: hidden }).where(eq(messages.id, messageId)));
}

/** Delete a set of slots (`deleteMessages`; message_variants cascade on the slot delete). Scoped to
 *  `chatId` so a stray foreign id can never delete another room's row. */
export function deleteMessagesStatement(db: Db, chatId: ChatId, messageIds: readonly MessageId[]): BatchStmt {
  return batchStmt(db.delete(messages).where(and(eq(messages.chatId, chatId), inArray(messages.id, [...messageIds]))));
}

/** Re-stamp a set of slots' `characterId` attribution (host-only — `reattributeMessages`; the self-heal
 *  hash-diff re-voice). Scoped to `chatId`. */
export function reattributeMessagesStatement(db: Db, chatId: ChatId, messageIds: readonly MessageId[], characterId: CharacterId): BatchStmt {
  return batchStmt(
    db
      .update(messages)
      .set({ characterId })
      .where(and(eq(messages.chatId, chatId), inArray(messages.id, [...messageIds]))),
  );
}

/** Re-stamp a set of slots' `personaId` (the authoring-persona / `{{user}}` axis — `reattributePersona`;
 *  author-or-host per row). Scoped to `chatId` AND `role = 'user'` — an assistant/system row is never
 *  re-stamped even if its id slips into the set. */
export function reattributePersonaStatement(db: Db, chatId: ChatId, messageIds: readonly MessageId[], personaId: PersonaId): BatchStmt {
  return batchStmt(
    db
      .update(messages)
      .set({ personaId })
      .where(and(eq(messages.chatId, chatId), inArray(messages.id, [...messageIds]), eq(messages.role, "user"))),
  );
}

/** Shift every slot in `[lo, hi]` (inclusive) by a uniform `by` (the `moveMessage` re-sequence phase 1) —
 *  parks the affected range above the canon head before the per-row final stamp (phase 2 =
 *  {@link setMessageSeqStatement}), so a contiguous reorder never transiently violates the seq unique. */
export function shiftSeqRangeStatement(
  db: Db,
  params: {
    readonly chatId: ChatId;
    readonly lo: number;
    readonly hi: number;
    readonly by: number;
  },
): BatchStmt {
  return batchStmt(
    db
      .update(messages)
      .set({ seq: sql`${messages.seq} + ${params.by}` })
      .where(and(eq(messages.chatId, params.chatId), gte(messages.seq, params.lo), lte(messages.seq, params.hi))),
  );
}

/** Stamp one slot's final `seq` by id (the `moveMessage` re-sequence phase 2). */
export function setMessageSeqStatement(db: Db, messageId: MessageId, seq: number): BatchStmt {
  return batchStmt(db.update(messages).set({ seq }).where(eq(messages.id, messageId)));
}

/**
 * Reconstruct the `MessageView` for a freshly-committed message (variantCount 1, the just-inserted variant
 * selected at idx 0) without a re-read — byte-for-byte what `loadCanonHistory` would return for this slot.
 */
export function buildCommittedMessageView(params: InsertCanonMessageParams): MessageView {
  return {
    id: params.messageId,
    chatId: params.chatId,
    seq: params.seq,
    role: params.role,
    authorUserId: params.authorUserId ?? null,
    characterId: params.characterId ?? null,
    personaId: params.personaId ?? null,
    excludedFromPrompt: params.excludedFromPrompt ?? false,
    createdAt: params.now,
    editedAt: null,
    selectedVariantId: params.variantId,
    selectedVariantIdx: 0,
    variantCount: 1,
    // A freshly-committed variant has never been continued — its D26 snapshot columns are null.
    hasContinuation: false,
    ...variantEconomics(params.variant),
    // The freshly-committed view's tool exchanges — the read seam's `[]`-default (never null) for the
    // client's tool read surface; a non-tool turn commits an empty array (tool-use-design/03 §3).
    toolCalls: params.variant.toolCalls ?? [],
  };
}
