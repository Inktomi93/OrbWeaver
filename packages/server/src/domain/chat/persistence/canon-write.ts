// domain/chat/persistence/canon-write — the D26 PRODUCTION canon writer. The EXPLICIT named exception to
// "persistence is queries only" (like `lock.ts`):
// it builds the INSERT/UPDATE statements that commit a message slot + its variants. The 3-step circular-FK
// dance mirrors the `_support` harness's `seedMessage`, but this is the live writer — every statement is a
// `BatchStmt` the engine commits ATOMICALLY in ONE `db.batch` (so the slot, its first variant, the pointer
// flip, AND the injected stats delta all land or none do).
//
// THE D26 3-STEP DANCE (the circular FK: `messages.selectedVariantId → message_variants.id` AND
// `message_variants.messageId → messages.id`):
//   1. INSERT the slot with `selectedVariantId = null` (the column is nullable SOLELY to break the cycle).
//   2. INSERT the first variant (`messageId` → the slot, which now exists in-batch).
//   3. UPDATE the slot's `selectedVariantId` → the variant (now exists). FK-safe in emitted order.
//
// DETERMINISM: every id (messageId/variantId), `seq`, and `createdAt` is CALLER-STAMPED (the engine's
// injected minters + clock + `loadMaxMessageSeq`-derived seq) — no `unixepoch()` default, no ambient mint.
//
// NO `loadCanonHistory`-style read here (that is `queries.ts`): a fresh insert's `MessageView` is fully known
// from the stamped inputs (variantCount 1, idx 0), so {@link buildCommittedMessageView} RECONSTRUCTS it
// instead of a round-trip — the bus `messageCommitted` carrier + the `TurnOutcome` row, byte-for-byte what a
// re-read would return.
//
// TYPES-IN-CONTRACT: the param shapes are FILE-LOCAL (the `types-in-contract` gate forbids an exported
// feature type outside contract/); callers pass a structurally-matching literal (TS infers at the call site).

import type { AssembledPrompt, MessageView, ToolCallRecord } from "@orb/contracts/chat";
import type { UserIntent } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { messages, messageVariants } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchStmt } from "@orb/db/kit";
import type {
  CharacterId,
  ChatId,
  MessageId,
  MessageVariantId,
  PersonaId,
  UserId,
} from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import type { MessageRole } from "@orb/kit/message-role";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";

/** The generation record for one `message_variants` row (D26): all content + economics + the per-swipe
 *  snapshot. Every field but `content` is optional — an unreported economics field stays absent (never a
 *  fabricated zero; the read-seam returns null). */
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
  /** D26 provenance columns — the output cap the backend echoed + the requested reasoning effort (F10). */
  readonly maxOutputTokens?: number | null | undefined;
  readonly reasoningEffort?: string | null | undefined;
  /** The §8 fit-pass boundary (`TurnPipelineResult.contextBoundaryMessageId`) — the earliest message
   *  actually included in the assembled history this generation. Null ⇒ nothing was dropped / the
   *  fit-pass never ran. */
  readonly contextBoundaryMessageId?: MessageId | null | undefined;
  /** The generation window bounds (epoch-ms) the engine stamps around the pipeline (D26 `gen_started_at`/
   *  `gen_finished_at`). Persistence-only columns (NOT on the read `MessageView`) — the reconcile + the live
   *  stats mirror both read `gf − gs` for gen-time/throughput; absent ⇒ null (a verbatim/greeting seed, F2). */
  readonly genStartedAt?: number | null | undefined;
  readonly genFinishedAt?: number | null | undefined;
  readonly ttftMs?: number | null | undefined;
  readonly finishReason?: string | null | undefined;
  readonly stopReason?: string | null | undefined;
  readonly terminalReason?: string | null | undefined;
  readonly params?: UserIntent | null | undefined;
  readonly promptSnapshot?: AssembledPrompt | null | undefined;
  /** D46 runtime plane — the ordered variable ops this variant applied (the turn's macro op-log). Absent/[] ⇒
   *  no variable mutations; persisted as-is and folded (`foldVarOps`) into `chats.runtime_variables`. */
  readonly variableDelta?: readonly VarOp[] | null | undefined;
  /** D48 — the turn's cumulative tool exchange (emission/execution order across every recursion depth;
   *  tool-use-design/03 §3). Null/absent ⇒ a tool-less turn (never []). */
  readonly toolCalls?: readonly ToolCallRecord[] | null | undefined;
}

/** The slot attribution (D26 — SLOT-level; a swipe never re-voices). All nullable per role. */
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
  readonly now: number;
  readonly variant: CanonVariantInput;
}

/** The economics fields shared by the `message_variants` insert AND the `MessageView` read-model — one home
 *  so the committed view can't drift from the persisted row. All `?? null` (the read-seam null contract). */
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
}

/** Normalize a {@link CanonVariantInput}'s economics to the read-seam null contract (the shared subset). */
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
  };
}

/** Map a variant payload → the `message_variants` insert columns (the shared economics + idx/params/snapshot). */
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
    // D26 provenance columns (F10) — the per-variant cap in force + the requested reasoning effort.
    maxOutputTokens: args.variant.maxOutputTokens ?? null,
    reasoningEffort: args.variant.reasoningEffort ?? null,
    // Persistence-only gen bounds (not on the read view) — the stats gen-time axis reads `gf − gs` (F2).
    genStartedAt: args.variant.genStartedAt ?? null,
    genFinishedAt: args.variant.genFinishedAt ?? null,
    params: args.variant.params ?? null,
    promptSnapshot: args.variant.promptSnapshot ?? null,
    variableDelta: args.variant.variableDelta ?? null,
    toolCalls: args.variant.toolCalls ?? null,
    createdAt: args.now,
  };
}

/**
 * The D26 3-step dance as a batch fragment: [insert slot (pointer null), insert variant idx 0, set pointer].
 * The engine concatenates this with the stats-delta statements and commits ONE `db.batch` — atomic. The
 * statements MUST execute in this order (the FK cycle is broken by the null pointer then closed at step 3).
 */
export function insertCanonMessageStatements(
  db: Db,
  params: InsertCanonMessageParams,
): BatchStmt[] {
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
    batchStmt(
      db
        .update(messages)
        .set({ selectedVariantId: params.variantId })
        .where(eq(messages.id, params.messageId)),
    ),
  ];
}

/** The pointer flip (`selectVariant` — D26: a zero-copy pointer move to a sibling swipe, never a content
 *  copy). The caller verifies the variant belongs to the slot (the read-seam `variantCount` / authority). */
export function selectActiveVariantStatement(
  db: Db,
  messageId: MessageId,
  variantId: MessageVariantId,
): BatchStmt {
  return batchStmt(
    db.update(messages).set({ selectedVariantId: variantId }).where(eq(messages.id, messageId)),
  );
}

/** Append a fresh variant to an EXISTING slot (a swipe/regen reroll — D26: the slot is unchanged, a new
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
 * Continue-in-place (D26): extend an EXISTING variant's content + record the undo snapshot. ONE `UPDATE` of
 * the slot's SELECTED variant — `content`/`reasoning`/economics become the NEW (pre + continuation) generation;
 * `preContinue*` snapshots the pre-continuation state (what `undoContinue` restores) and `lastContinuation*`
 * records the appended continuation (what `revertContinue` re-applies). The caller computes the merged content;
 * this writes it atomically alongside the snapshot so undo/revert round-trip. `idx`/`createdAt` are untouched
 * (the variant keeps its identity — continue extends it, never appends a sibling).
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
          ...variantEconomics(params.variant),
          // A continue RE-generates, so the gen window is re-stamped to the continuation's (F2 — the mirror
          // delta is `(new − old)` on the slot, both reading the persisted `gf − gs`).
          genStartedAt: params.variant.genStartedAt ?? null,
          genFinishedAt: params.variant.genFinishedAt ?? null,
          params: params.variant.params ?? null,
          promptSnapshot: params.variant.promptSnapshot ?? null,
          // A continue re-runs assembly (macros fire again) → its op-log REPLACES this variant's delta (the
          // variant keeps its identity; its recorded mutations are the latest run's — D46).
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

/** Set a variant's `content`/`reasoning` directly (the `undoContinue`/`revertContinue` restore — a pointer-free
 *  content swap from the `preContinue*`/`lastContinuation*` snapshot; D26). The economics/snapshot columns are
 *  untouched so a restore is reversible by its twin. */
export function setVariantContentStatement(
  db: Db,
  variantId: MessageVariantId,
  content: string,
  reasoning: string | null,
): BatchStmt {
  return batchStmt(
    db.update(messageVariants).set({ content, reasoning }).where(eq(messageVariants.id, variantId)),
  );
}

/** Merge a base + a continuation text/reasoning (continue/revert): null only when BOTH are null (so an
 *  unreasoned continuation of an unreasoned base stays null), else the concatenation. One home (engine +
 *  verbs both fold continue state through this). */
export function combineReasoning(base: string | null, addition: string | null): string | null {
  if (base === null && addition === null) {
    return null;
  }
  return (base ?? "") + (addition ?? "");
}

// ── chunk-13 canon-edit statements (D26: variant content/reasoning vs slot selection/attribution/hidden/seq) ──

/** Edit the SELECTED variant's CONTENT in place (D26 — `editMessage`; the edit mutates the variant, never
 *  doubles content) and stamp `messages.editedAt` (the slot's edit marker). Two statements (variant + slot). */
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
    batchStmt(
      db
        .update(messageVariants)
        .set({ content: params.content })
        .where(eq(messageVariants.id, params.variantId)),
    ),
    batchStmt(
      db
        .update(messages)
        .set({ editedAt: params.editedAt })
        .where(eq(messages.id, params.messageId)),
    ),
  ];
}

/** Set the SELECTED variant's REASONING (D26 — `editReasoning` writes text, `clearReasoning` writes null) and
 *  stamp `messages.editedAt`. The content is untouched (reasoning is a sibling column on the variant). */
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
    batchStmt(
      db
        .update(messageVariants)
        .set({ reasoning: params.reasoning })
        .where(eq(messageVariants.id, params.variantId)),
    ),
    batchStmt(
      db
        .update(messages)
        .set({ editedAt: params.editedAt })
        .where(eq(messages.id, params.messageId)),
    ),
  ];
}

/** Toggle a slot's `excludedFromPrompt` (D26 — `setMessageHidden`; the row survives, it is held out of
 *  assembly). A pure slot-flag write (no variant change, no content copy). */
export function setMessageHiddenStatement(
  db: Db,
  messageId: MessageId,
  hidden: boolean,
): BatchStmt {
  return batchStmt(
    db.update(messages).set({ excludedFromPrompt: hidden }).where(eq(messages.id, messageId)),
  );
}

/** Delete a set of slots (D26 — `deleteMessages`; the message_variants CASCADE on the slot delete). Scoped to
 *  `chatId` so a stray foreign id can never delete another room's row. ONE statement. */
export function deleteMessagesStatement(
  db: Db,
  chatId: ChatId,
  messageIds: readonly MessageId[],
): BatchStmt {
  return batchStmt(
    db
      .delete(messages)
      .where(and(eq(messages.chatId, chatId), inArray(messages.id, [...messageIds]))),
  );
}

/** Re-stamp a set of slots' `characterId` attribution (host-only — `reattributeMessages`; D26 attribution is
 *  SLOT-level, the self-heal hash-diff re-voice). Scoped to `chatId`. ONE statement. */
export function reattributeMessagesStatement(
  db: Db,
  chatId: ChatId,
  messageIds: readonly MessageId[],
  characterId: CharacterId,
): BatchStmt {
  return batchStmt(
    db
      .update(messages)
      .set({ characterId })
      .where(and(eq(messages.chatId, chatId), inArray(messages.id, [...messageIds]))),
  );
}

/** Re-stamp a set of slots' `personaId` (the authoring-persona / `{{user}}` axis — `reattributePersona`;
 *  author-or-host per row, Chat-Macro-Resolution §5). Scoped to `chatId` AND `role = 'user'` (the belt: only a
 *  user row carries a meaningful authoring persona — an assistant/system row is NEVER re-stamped even if its id
 *  slips into the set; the verb also rejects such an id up front). ONE statement. */
export function reattributePersonaStatement(
  db: Db,
  chatId: ChatId,
  messageIds: readonly MessageId[],
  personaId: PersonaId,
): BatchStmt {
  return batchStmt(
    db
      .update(messages)
      .set({ personaId })
      .where(
        and(
          eq(messages.chatId, chatId),
          inArray(messages.id, [...messageIds]),
          eq(messages.role, "user"),
        ),
      ),
  );
}

/** Shift EVERY slot in `[lo, hi]` (inclusive) by a UNIFORM `by` (the `moveMessage` re-sequence phase 1). A
 *  single uniform shift is collision-free (a bijection onto a disjoint range) — used to PARK the affected
 *  range above the canon head before the per-row final stamp (phase 2 = {@link setMessageSeqStatement}), so a
 *  contiguous reorder never transiently violates the `(chatId, seq)` UNIQUE. */
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
      .where(
        and(
          eq(messages.chatId, params.chatId),
          gte(messages.seq, params.lo),
          lte(messages.seq, params.hi),
        ),
      ),
  );
}

/** Stamp one slot's final `seq` by id (the `moveMessage` re-sequence phase 2 — each target is in the vacated
 *  range, so the per-row writes never collide). */
export function setMessageSeqStatement(db: Db, messageId: MessageId, seq: number): BatchStmt {
  return batchStmt(db.update(messages).set({ seq }).where(eq(messages.id, messageId)));
}

/**
 * Reconstruct the `MessageView` for a FRESHLY-committed message (variantCount 1, the just-inserted variant
 * selected at idx 0) WITHOUT a re-read — byte-for-byte what `loadCanonHistory` would return for this slot.
 * `editedAt` is null (never edited); `selectedVariantIdx` 0 (the first variant).
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
    ...variantEconomics(params.variant),
  };
}
