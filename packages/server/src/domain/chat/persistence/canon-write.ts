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

import type {
  AssembledPrompt,
  MacroFreezeRecord,
  MessageAssetOrigin,
  MessageKind,
  MessageView,
  TokenProvenance,
  ToolCallRecord,
  TurnInitiator,
  UserMacroDraws,
  VariantMetadata,
} from "@orb/contracts/chat";
import { DEFAULT_MESSAGE_KIND } from "@orb/contracts/chat";
import type { CostDetails, NormalizedFinishReason, ProviderId } from "@orb/contracts/inference";
import type { EffortLevel, UserIntent } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { messageAssets, messages, messageVariants } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt, isConstraintViolation } from "@orb/db/kit";
import type { ReasoningContentPart } from "@orb/inference";
import type { AssetId, CharacterId, ChatId, MessageAssetId, MessageId, MessageVariantId, ModelId, PersonaId, UserConnectionId, UserId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import type { MessageRole } from "@orb/kit/message-role";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { CHAT_OP_CODES, ChatOperationError } from "../contract/errors.ts";
import { loadMaxMessageSeq } from "./queries.ts";

/** The generation record for one `message_variants` row: all content + economics + the per-swipe snapshot.
 *  Every field but `content` is optional — an unreported economics field stays absent. */
interface CanonVariantInput {
  readonly content: string;
  readonly reasoning?: string | null | undefined;
  readonly model?: ModelId | null | undefined;
  readonly provider?: ProviderId | null | undefined;
  /** ATTRIBUTION (§5.3b): the connection row that generated this swipe (SET NULL on delete); null on a
   *  user-authored row, an import or an edit. */
  readonly connectionId?: UserConnectionId | null | undefined;
  readonly tokensIn?: number | null | undefined;
  readonly tokensOut?: number | null | undefined;
  /** Explicit for imports; provider usage defaults to measured whenever either token column is present. */
  readonly tokenProvenance?: TokenProvenance | undefined;
  readonly cacheReadTokens?: number | null | undefined;
  readonly cacheWriteTokens?: number | null | undefined;
  /** The reasoning share of `tokensOut` where the wire reports one (inference audit B5); absent ⇒ NULL. */
  readonly reasoningTokens?: number | null | undefined;
  readonly costUsd?: number | null | undefined;
  /** §5.3c — the SAME tuple as `tokenProvenance`; absent ⇒ `unrecorded`. */
  readonly costProvenance?: TokenProvenance | null | undefined;
  /** The breakdown behind `costUsd` (`cost_details`, parsed by `costDetailsSchema` at any read seam — A4/B8);
   *  absent ⇒ NULL, never an empty record. */
  readonly costDetails?: CostDetails | null | undefined;
  /** The model's reasoning blocks WITH per-wire provenance (`reasoning_parts`, audit A1) — the replay material
   *  the assembly re-materializes onto the assistant row (`carryReasoning`, §8.8). Absent/[] ⇒ NULL: a turn
   *  whose reasoning carried no provenance has nothing replayable (the converters refuse an unsigned block). */
  readonly reasoningParts?: readonly ReasoningContentPart[] | null | undefined;
  readonly contextWindow?: number | null | undefined;
  /** The output cap the backend echoed + the APPLIED reasoning effort (what the wire carried, B1 — the
   *  requested intent is `params`). */
  readonly maxOutputTokens?: number | null | undefined;
  readonly reasoningEffort?: EffortLevel | null | undefined;
  /** The fit-pass boundary — the earliest message actually included in the assembled history this
   *  generation. Null ⇒ nothing was dropped / the fit-pass never ran. */
  readonly contextBoundaryMessageId?: MessageId | null | undefined;
  /** The generation window bounds (epoch-ms) the engine stamps around the pipeline. Persistence-only
   *  columns (not on the read `MessageView`); absent ⇒ null (a verbatim/greeting seed). */
  readonly genStartedAt?: number | null | undefined;
  readonly genFinishedAt?: number | null | undefined;
  /** The provider's response id for this generation (OpenRouter `gen-…` — the cost key; Anthropic
   *  `msg_…` — the support handle; B7). Absent/null where the wire reports none (agent-sdk / a user-authored row). */
  readonly generationId?: string | null | undefined;
  readonly ttftMs?: number | null | undefined;
  /** The generation's metadata sidecar (`message_variants.metadata`) — a CLOSED shape (§5.3c class 3), today
   *  carrying exactly one key on this path: the measured reasoning window
   *  (`VARIANT_METADATA_REASONING_MS_KEY`, #184), which the stats rollups extract by JSON path. Typed rather
   *  than a bag, so this writer and those readers are bound by `tsc` — the producer-side half of class 3.
   *  Absent/null ⇒ no sidecar (a turn that never reasoned, a verbatim/greeting seed). NOT on
   *  `VariantEconomics`: the read `MessageView` does not carry it — it is a stats-plane fact, not a rendered
   *  one — and the ST import writes the same column through its own path. */
  readonly metadata?: VariantMetadata | null | undefined;
  // The NORMALIZED reason (`NORMALIZED_FINISH_REASONS`, CHECK-enforced) — the per-wire raw → normalized fold
  // happens in the runtime; `stopReason` keeps the raw upstream word as provenance.
  readonly finishReason?: NormalizedFinishReason | null | undefined;
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
  /** The turn's user-macro random-pick draw record (WAVE MU delivery) — frozen ∪ fresh, resolved once at
   *  registry build and immutable for the round. Persisted so a swipe/continue of this variant replays the
   *  identical draw. Absent/null ⇒ the turn drew nothing. */
  readonly macroDraws?: UserMacroDraws | null | undefined;
  /** The pre-freeze / pre-regex authored text this variant's `content` was transformed FROM (the composer
   *  draft, the raw model output). Hand it over unconditionally — the writer stores it only when it actually
   *  differs (rule 1 below), which is what keeps the common case free. HOST-PLANE (never on `MessageView`). */
  readonly rawContent?: string | null | undefined;
  /** The volatile-macro occurrences this commit froze into `content` (the roll/random/clock family), in
   *  occurrence order. Absent/null ⇒ nothing froze. Paired with `rawContent`, it makes the variant's macro
   *  spans re-derivable byte-exactly (and an intentional re-roll possible). HOST-PLANE. */
  readonly macroFreezes?: MacroFreezeRecord | null | undefined;
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
  /** The row's declared PURPOSE. Absent ⇒ `standard` (the DB default), so every writer that does not
   *  deliberately declare one stays byte-identical; only the narrator writers pass `'narrator'`. */
  readonly kind?: MessageKind | undefined;
  readonly excludedFromPrompt?: boolean | undefined;
  /** The turn's origin — stamped on the reply SLOT. Absent ⇒ the DB defaults
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
  readonly model: ModelId | null;
  readonly provider: ProviderId | null;
  readonly connectionId: UserConnectionId | null;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly tokenProvenance: TokenProvenance;
  readonly costProvenance: TokenProvenance;
  readonly cacheReadTokens: number | null;
  readonly cacheWriteTokens: number | null;
  readonly costUsd: number | null;
  readonly contextWindow: number | null;
  readonly contextBoundaryMessageId: MessageId | null;
  readonly ttftMs: number | null;
  readonly finishReason: NormalizedFinishReason | null;
  readonly stopReason: string | null;
  readonly terminalReason: string | null;
  /** Gen-window bounds (epoch-ms) — the stats gen-time axis and the `showGenerationTimer` chip
   *  both read `gf − gs`. A continue re-stamps them to the continuation's window. */
  readonly genStartedAt: number | null;
  readonly genFinishedAt: number | null;
  /** The provider's response id (OpenRouter `gen-…` — the per-message cost key; Anthropic `msg_…`). On both
   *  the insert columns and the read `MessageView` (one home; the committed view can't drift from the row). */
  readonly generationId: string | null;
}

/** Normalize a {@link CanonVariantInput}'s economics to the read-seam null contract. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a flat one-field-per-column `?? null` normalize — every operator is one independent coalesce, zero nesting/branching; splitting it would scatter the one-home economics shape (same posture as `canonMessageDelta` above).
function variantEconomics(v: CanonVariantInput): VariantEconomics {
  const tokensIn = v.tokensIn ?? null;
  const tokensOut = v.tokensOut ?? null;
  return {
    content: v.content,
    reasoning: v.reasoning ?? null,
    model: v.model ?? null,
    provider: v.provider ?? null,
    connectionId: v.connectionId ?? null,
    tokensIn,
    tokensOut,
    tokenProvenance: v.tokenProvenance ?? (tokensIn !== null || tokensOut !== null ? "measured" : "unrecorded"),
    cacheReadTokens: v.cacheReadTokens ?? null,
    cacheWriteTokens: v.cacheWriteTokens ?? null,
    costUsd: v.costUsd ?? null,
    costProvenance: v.costProvenance ?? "unrecorded",
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

// ── THE FREEZE-PROVENANCE RULE (D129-F) ──────────────────────────────────────────────────────────────
// `rawContent`/`macroFreezes` describe how THIS variant's CURRENT `content` came to be, so:
//
//   1. FORWARD (an invariant, enforced here, true of every row): `raw_content` is stored NON-NULL only when
//      it DIFFERS from `content`, and `macro_freezes` non-null only when it is non-empty. No redundant copy
//      of a body ever hits the DB, and no reader has to compare to find out whether the raw says anything.
//   2. NULL means "no distinct pre-transform text is served for this row" — NOT "the authored text was
//      byte-identical". Three ways to get there and only the first is identity: nothing transformed the body;
//      a later content write invalidated the provenance (below); or `verbs/fork.ts`'s host-plane allow-list
//      STRIPPED it on a member→host copy (deliberate — pre-strip bytes must not travel).
//
// The reverse reading ("NULL ⇔ byte-identical") is NOT claimed. It was, and it was false: the fork strip and
// the content-writers below both produce honest NULLs over a body whose authored text differed.
//
// WHY A CONTENT WRITE INVALIDATES: after a hand edit or a continue undo/revert, the stored body is no longer
// the thing this raw + record produced — the record would describe a bake that is not in these bytes, and
// `loadVariantWire` would serve a host that lie. Re-resolving from a pre-edit raw would also resurrect text
// the human deleted (D130's removal reasoning). So a content write that is not the freeze itself CLEARS both
// columns: the edited body is authored, not transformed, and honest absence beats stale provenance.

/** Normalize the freeze-provenance pair to rule 1 above. A caller that hands over a raw equal to the content,
 *  or an empty record, cannot violate the invariant from here. */
function freezeProvenanceColumns(
  content: string,
  rawContent: string | null | undefined,
  macroFreezes: MacroFreezeRecord | null | undefined,
): { rawContent: string | null; macroFreezes: MacroFreezeRecord | null } {
  return {
    rawContent: rawContent === null || rawContent === undefined || rawContent === content ? null : rawContent,
    macroFreezes: macroFreezes === null || macroFreezes === undefined || macroFreezes.length === 0 ? null : macroFreezes,
  };
}

/** The columns a NON-FREEZE content write sets to keep rule 1 true (see the block above): the replaced body's
 *  provenance is dropped rather than left describing bytes that are gone. Spread into every `.set()` that
 *  writes `content` and is not {@link freezeVariantContentStatement} — which is what makes the invariant a
 *  property of the writer set rather than a hope about callers. */
const CLEARED_FREEZE_PROVENANCE = { rawContent: null, macroFreezes: null } as const;

/** `reasoning_parts` is NULL when there is nothing replayable — an empty list would make the column's "has
 *  replay material" question a lie and costs a row of JSON for nothing (the `metadata` sidecar's posture). */
function reasoningPartsColumn(parts: readonly ReasoningContentPart[] | null | undefined): readonly ReasoningContentPart[] | null {
  return parts === null || parts === undefined || parts.length === 0 ? null : parts;
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
    metadata: args.variant.metadata ?? null,
    maxOutputTokens: args.variant.maxOutputTokens ?? null,
    reasoningEffort: args.variant.reasoningEffort ?? null,
    reasoningTokens: args.variant.reasoningTokens ?? null,
    costDetails: args.variant.costDetails ?? null,
    reasoningParts: reasoningPartsColumn(args.variant.reasoningParts),
    params: args.variant.params ?? null,
    promptSnapshot: args.variant.promptSnapshot ?? null,
    variableDelta: args.variant.variableDelta ?? null,
    toolCalls: args.variant.toolCalls ?? null,
    macroDraws: args.variant.macroDraws ?? null,
    // Raw + freeze provenance — null unless a persist-time transform actually changed bytes / a volatile
    // macro actually froze (the columns' own contract; see schema/chat.ts).
    ...freezeProvenanceColumns(args.variant.content, args.variant.rawContent, args.variant.macroFreezes),
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
        kind: params.kind ?? DEFAULT_MESSAGE_KIND,
        authorUserId: params.authorUserId ?? null,
        characterId: params.characterId ?? null,
        personaId: params.personaId ?? null,
        selectedVariantId: null,
        excludedFromPrompt: params.excludedFromPrompt ?? false,
        // Origin — omitted stays the DB default ('human'/0), so a human/character commit is
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
    /** WHY the links exist (`MESSAGE_ASSET_ORIGINS`) — one origin per call; each writer names its own. */
    readonly origin: MessageAssetOrigin;
    readonly now: number;
  },
): BatchStmt[] {
  return params.rows.map((r) =>
    batchStmt(
      db.insert(messageAssets).values({
        id: r.id,
        messageId: r.messageId,
        assetId: r.assetId,
        origin: params.origin,
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

/** How many head allocations one append may lose before it refuses. Not a contention budget — see
 *  {@link commitCanonAppend}'s "IT IS BOUNDED" note; the sibling CAS loop in `substrate/variable-ops.ts`
 *  carries the same number for the same reason.
 *
 *  @public Test-anchored module surface; focused tests pin this production-local behavior. */
export const MAX_CANON_APPEND_ATTEMPTS = 8;

/**
 * Commit an APPEND at the canon head, re-allocating the seq if another writer took it first — the ONE home
 * for the head-allocation retry (#1463 item 7).
 *
 * WHY IT EXISTS: `messages.seq` is allocated by reading the current head and adding one, and `(chat_id, seq)`
 * is UNIQUE. Two appends that read the same head therefore both aim at the same slot and one of them trips
 * the constraint — a real interleaving, since the narrator post and the image post are both driven by
 * fire-and-forget callers (automation dispatch, the plugin bridge, rpg's turn ops and checkpoint restore).
 * The image path carried this retry and the narrator path did not, so the same race lost a whole message on
 * one side and was invisible on the other; one home is what keeps them from disagreeing again.
 *
 * `build` is called ONCE PER ATTEMPT with the allocated seq and mints the attempt's own ids: a retry must
 * discard the whole attempted allocation (ids included) rather than re-aim the same row, and it must never
 * re-run whatever produced the CONTENT — by here that work is done and, for a generated image, already paid
 * for. The retry is narrow on purpose: a UNIQUE violation is only treated as a lost race when the head has
 * actually reached the seq this attempt aimed at, so an unrelated unique failure (a duplicate message id)
 * stays loud instead of spinning.
 *
 * IT IS BOUNDED, and the bound is not a contention budget (#1634 item 2). Every loss means a sibling
 * COMMITTED, so a chat busy enough to lose twice is still making progress; losing {@link
 * MAX_CANON_APPEND_ATTEMPTS} times in a row is a defect somewhere else — a caller re-aiming at a fixed seq,
 * a head advancing faster than any writer can land — and an unbounded retry answers that by spinning until
 * the process dies rather than saying so. Same posture, same shape as the standalone variable plane's CAS
 * loop (`substrate/variable-ops.ts`), so the two cannot drift into disagreeing about it.
 */
export async function commitCanonAppend<T>(
  db: Db,
  chatId: ChatId,
  build: (seq: number) => { readonly statements: readonly BatchStmt[]; readonly result: T },
): Promise<T> {
  for (let attempt = 0; attempt < MAX_CANON_APPEND_ATTEMPTS; attempt += 1) {
    const seq = (await loadMaxMessageSeq(db, chatId)) + 1;
    const { statements, result } = build(seq);
    const landed = await commitOrLoseAllocation(db, chatId, statements, seq);
    if (landed) {
      return result;
    }
  }
  throw new ChatOperationError(
    CHAT_OP_CODES.canonAppendContended,
    `chat ${chatId}: a canon append lost the head allocation ${MAX_CANON_APPEND_ATTEMPTS} times`,
  );
}

/** One attempt: `true` when it committed, `false` when it provably lost the head to a sibling. Any other
 *  failure — including a UNIQUE violation the head does NOT explain (a duplicate message/variant id) —
 *  propagates, so a caller bug stays loud instead of being retried as contention. */
async function commitOrLoseAllocation(db: Db, chatId: ChatId, statements: readonly BatchStmt[], seq: number): Promise<boolean> {
  try {
    await db.batch(batchMany(statements));
    return true;
  } catch (err) {
    // CLASSIFIED, never swallowed (which is why this needs no suppression — the caught-failure-ownership
    // gate does not flag it, measured): the only error consumed here is a UNIQUE violation the canon head
    // itself explains (another append reached this seq), reported as `false` and re-allocated by the caller.
    // Everything else rethrows unchanged.
    if (isConstraintViolation(err)?.kind === "unique" && (await loadMaxMessageSeq(db, chatId)) >= seq) {
      return false;
    }
    throw err;
  }
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
          // The continuation's `tokensOut`/`costUsd` land above, so the effort it applied, its reasoning share
          // and its cost breakdown follow — a stale `costDetails` beside a fresh `costUsd` would contradict
          // itself (B1/B5/B8). `maxOutputTokens` stays insert-only as before.
          reasoningEffort: params.variant.reasoningEffort ?? null,
          reasoningTokens: params.variant.reasoningTokens ?? null,
          costDetails: params.variant.costDetails ?? null,
          // The `reasoning_duration` sidecar re-stamps to the continuation's own window, mirroring
          // `genStartedAt`/`genFinishedAt` above: the engine's continue stats delta adds the continuation's
          // reasoning window and subtracts the base's (docs/work/0146), so the row must hold that same
          // continuation-only value or a `reconcileStats` rebuild reads the stale base window forever.
          metadata: params.variant.metadata ?? null,
          // The continuation's own reasoning blocks replace the base's: only the LAST generation's signed blocks
          // are replayable on the next leg (the rendered `reasoning` text, by contrast, is COMBINED above).
          reasoningParts: reasoningPartsColumn(params.variant.reasoningParts),
          params: params.variant.params ?? null,
          promptSnapshot: params.variant.promptSnapshot ?? null,
          // A continue re-runs assembly, so its op-log replaces this variant's delta.
          variableDelta: params.variant.variableDelta ?? null,
          toolCalls: params.variant.toolCalls ?? null,
          // A continue replays the slot's frozen draws (threaded via the prep) — re-stamp the identical record.
          macroDraws: params.variant.macroDraws ?? null,
          // The merged body is not what this variant's freeze produced (a frozen greeting is continuable), so
          // its provenance is dropped rather than left describing a bake these bytes no longer contain.
          ...CLEARED_FREEZE_PROVENANCE,
          preContinueContent: params.preContinueContent,
          preContinueReasoning: params.preContinueReasoning,
          lastContinuationContent: params.lastContinuationContent,
          lastContinuationReasoning: params.lastContinuationReasoning,
        })
        .where(eq(messageVariants.id, params.variantId)),
    ),
  ];
}

/**
 * The COMMIT-TIME VOLATILE FREEZE applied to an ALREADY-PERSISTED variant (D129-F) — today the greeting
 * first-user-turn bake (`freezeGreetingVolatiles`). Distinct from {@link setVariantContentStatement} (the
 * continue undo/redo content swap) because a freeze is not a content edit: it rewrites `content` AND records
 * the provenance that makes the rewrite reversible — the pre-freeze body in `raw_content` and the occurrences
 * it baked in `macro_freezes`, through the same NULL convention every fresh insert obeys. `reasoning` and the
 * economics columns are untouched: nothing generated here.
 */
export function freezeVariantContentStatement(
  db: Db,
  params: {
    readonly variantId: MessageVariantId;
    /** The post-freeze body (what every consumer now reads). */
    readonly content: string;
    /** The body as it stood BEFORE this bake. */
    readonly rawContent: string;
    readonly macroFreezes: MacroFreezeRecord;
  },
): BatchStmt {
  return batchStmt(
    db
      .update(messageVariants)
      .set({
        content: params.content,
        ...freezeProvenanceColumns(params.content, params.rawContent, params.macroFreezes),
      })
      .where(eq(messageVariants.id, params.variantId)),
  );
}

/** Set a variant's `content`/`reasoning` directly (the `undoContinue`/`revertContinue` restore — a
 *  pointer-free content swap from the `preContinue*`/`lastContinuation*` snapshot). The economics/snapshot
 *  columns are untouched so a restore is reversible by its twin — but the freeze provenance is NOT, because
 *  the snapshot it restores is a continue-era body this variant's raw never produced. (The continue that
 *  created those snapshots already cleared it; this keeps the pair honest if the order ever changes.) */
export function setVariantContentStatement(db: Db, variantId: MessageVariantId, content: string, reasoning: string | null): BatchStmt {
  return batchStmt(
    db
      .update(messageVariants)
      .set({ content, reasoning, ...CLEARED_FREEZE_PROVENANCE })
      .where(eq(messageVariants.id, variantId)),
  );
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
 *  doubles content) and stamp `messages.editedAt`. Two statements (variant + slot).
 *
 *  The edited body is AUTHORED, not transformed, so the freeze provenance is cleared: keeping it would leave a
 *  `macro_freezes` record describing a bake the new bytes may not contain, and — in the case that first
 *  exposed this — an edit that types the raw text back in would leave `raw_content` non-null and equal to
 *  `content`, which is the one shape rule 1 forbids. */
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
        .set({ content: params.content, ...CLEARED_FREEZE_PROVENANCE })
        .where(eq(messageVariants.id, params.variantId)),
    ),
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

/** Re-stamp EVERY slot in this chat authored by `fromCharacterId` onto `toCharacterId` — the host-handoff
 *  COPY's canon arm. Not a re-voicing: the copy IS the same character, and the
 *  point is that the transferred room's history stops depending on a card the departed host still owns.
 *  Without it the old host's `characters` DELETE would SET NULL every one of those slots (schema/chat.ts —
 *  the deliberate all-NULL-tolerant attribution CHECK) and the room's transcript would lose its speakers.
 *
 *  Id-set-free by design (the `reattributeMessages` twin takes explicit slot ids because a host is picking
 *  rows; this takes the WHOLE chat because the identity moved). Scoped to `chatId` — an identical card seated
 *  in another room is never touched, and the caller has already proven this room's authority. The attribution
 *  CHECK is unaffected: a `characterId` swap leaves the row's assistant-ness exactly as it was. */
export function restampChatCharacterStatement(db: Db, chatId: ChatId, fromCharacterId: CharacterId, toCharacterId: CharacterId): BatchStmt {
  return batchStmt(
    db
      .update(messages)
      .set({ characterId: toCharacterId })
      .where(and(eq(messages.chatId, chatId), eq(messages.characterId, fromCharacterId))),
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
    kind: params.kind ?? DEFAULT_MESSAGE_KIND,
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
    // client's tool read surface; a non-tool turn commits an empty array (D48).
    toolCalls: params.variant.toolCalls ?? [],
  };
}
