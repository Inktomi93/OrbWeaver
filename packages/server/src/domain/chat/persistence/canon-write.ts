// domain/chat/persistence/canon-write — the D26 PRODUCTION canon writer (chat.md Part I 8-slot
// `persistence/` + inv §15). The EXPLICIT named exception to "persistence is queries only" (like `lock.ts`):
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

import type { AssembledPrompt, MessageView } from "@orb/contracts/chat";
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
import type { MessageRole } from "@orb/kit/message-role";
import { eq } from "drizzle-orm";

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
  readonly ttftMs?: number | null | undefined;
  readonly finishReason?: string | null | undefined;
  readonly stopReason?: string | null | undefined;
  readonly terminalReason?: string | null | undefined;
  readonly params?: UserIntent | null | undefined;
  readonly promptSnapshot?: AssembledPrompt | null | undefined;
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
    params: args.variant.params ?? null,
    promptSnapshot: args.variant.promptSnapshot ?? null,
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
          params: params.variant.params ?? null,
          promptSnapshot: params.variant.promptSnapshot ?? null,
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
