// domain/chat/substrate/stats-delta — the StatsDelta builders (chat's; the apply is the injected
// `ctx.applyStatsDelta`, pushed into the same `db.batch` as the canon write so rollups stay fresh with
// no rebuild).
//
// The drift gate: a builder computes the CHANGE its write makes. The same `@orb/kit/stats-tally`
// primitives run here AND in `reconcileStats`, so the live delta can never drift from a rebuild.
//
// Owner = `runAsUserId` (the frozen host, who funds + owns the turn). `triggeredBy` remains initiator
// attribution and can differ from the stats owner.

import type { TokenProvenance, VariantMetadata } from "@orb/contracts/chat";
import { VARIANT_METADATA_REASONING_MS_KEY } from "@orb/contracts/chat";
import { modelIdSchema, providerIdSchema } from "@orb/contracts/inference";
import type { StatsDelta } from "@orb/contracts/stats";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { modelKey, utcDay, wordCount } from "@orb/kit/stats-tally";

/** Convert nullable historical attribution into the only model-stats identities the write contract admits.
 * A blank model has no bucket; a missing/malformed provider takes the ruled `(unknown)` bucket. */
function statsModelKey(model: string | null, provider: string | null): Pick<StatsDelta, "model" | "provider"> {
  if (model === null) {
    return { model: null, provider: null };
  }
  const parsedModel = modelIdSchema.safeParse(model);
  if (!parsedModel.success) {
    return { model: null, provider: null };
  }
  const parsedProvider = provider === null ? null : (providerIdSchema.safeParse(provider).data ?? null);
  return modelKey(parsedModel.data, parsedProvider);
}

/** The committed economics a turn-delta builder reads. All nullable — an unreported field contributes
 *  nothing (a sparse patch; never a fabricated zero). */
interface TurnEconomicsInput {
  readonly content: string;
  readonly reasoning?: string | null | undefined;
  readonly model?: string | null | undefined;
  readonly provider?: string | null | undefined;
  readonly tokensIn?: number | null | undefined;
  readonly tokensOut?: number | null | undefined;
  readonly tokenProvenance?: TokenProvenance | undefined;
  readonly cacheReadTokens?: number | null | undefined;
  readonly cacheWriteTokens?: number | null | undefined;
  readonly costUsd?: number | null | undefined;
  readonly genTimeMs?: number | null | undefined;
  /** The generation's context window → `owner_stats.maxContextTokens` (a MAX extremum, owner grain only). */
  readonly contextWindow?: number | null | undefined;
  /** The variant's PARSED metadata sidecar (§5.3c class 3) — read for `reasoning_duration` only (#184). The
   *  swipe/continue builders below read the same key off the COMMITTED row; this is the new-slot path's copy
   *  of it, so all three modes contribute reasoning time and the live writer can't drift from a rebuild on
   *  this column. The key is a typed `number | undefined` here because the column's shape is closed — a
   *  reader naming a key no writer produces stops compiling instead of rendering 0 forever. */
  readonly metadata?: VariantMetadata | null | undefined;
}

/** Set `target[key]` only when `value` is a real number (omit absent economics). */
function setNum(target: Record<string, number>, key: string, value: number | null | undefined): void {
  if (typeof value === "number") {
    target[key] = value;
  }
}

/** True when `v` is a real number (the sparse-patch include test for a conditional object spread). */
function has(v: number | null | undefined): v is number {
  return typeof v === "number";
}

function tokenProvenanceOf(e: Pick<TurnEconomicsInput, "tokensIn" | "tokensOut" | "tokenProvenance">): TokenProvenance {
  return e.tokenProvenance ?? (has(e.tokensIn) || has(e.tokensOut) ? "measured" : "unrecorded");
}

function tokenSampleSlice(args: {
  readonly prefix: "" | "daily" | "model";
  readonly provenance: TokenProvenance;
  readonly tokensIn: number | null | undefined;
  readonly tokensOut: number | null | undefined;
  readonly sign?: number;
}): Record<string, number> {
  const { prefix, provenance, tokensIn, tokensOut, sign = 1 } = args;
  if (provenance === "unrecorded") {
    return {};
  }
  const suffix = provenance === "measured" ? "MeasuredSamples" : "EstimatedSamples";
  const field = (axis: "TokensIn" | "TokensOut"): string =>
    `${prefix}${prefix === "" ? (axis[0]?.toLowerCase() ?? "") : (axis[0] ?? "")}${axis.slice(1)}${suffix}`;
  return {
    ...(has(tokensIn) ? { [field("TokensIn")]: sign } : {}),
    ...(has(tokensOut) ? { [field("TokensOut")]: sign } : {}),
  };
}

/** The decoupled model_stats slice (null model ⇒ `{}` — apply skips the model row). */
function modelSliceFor(model: string | null, e: TurnEconomicsInput): Record<string, number> {
  if (model === null) {
    return {};
  }
  const reasoningMs = reasoningMsOf(e.metadata ?? null);
  const tokenProvenance = tokenProvenanceOf(e);
  return {
    modelGenerations: 1,
    // A gen-time sample is counted only when a gen time is present, symmetric with the delete mirror.
    modelGenSamples: has(e.genTimeMs) ? 1 : 0,
    ...(typeof e.reasoning === "string" && e.reasoning.trim().length > 0 ? { modelReasoningGenerations: 1 } : {}),
    ...(reasoningMs > 0 ? { modelReasoningMs: reasoningMs } : {}),
    ...(has(e.tokensIn) ? { modelTokensIn: e.tokensIn } : {}),
    ...(has(e.tokensOut) ? { modelTokensOut: e.tokensOut } : {}),
    ...tokenSampleSlice({ prefix: "model", provenance: tokenProvenance, tokensIn: e.tokensIn, tokensOut: e.tokensOut }),
    ...(has(e.costUsd) ? { modelCostUsd: e.costUsd } : {}),
    ...(has(e.costUsd) ? { modelCostSamples: 1 } : {}),
    ...(has(e.genTimeMs) ? { modelGenTimeMs: e.genTimeMs } : {}),
    ...(has(e.cacheReadTokens) ? { modelCacheReadTokens: e.cacheReadTokens } : {}),
    ...(has(e.cacheWriteTokens) ? { modelCacheWriteTokens: e.cacheWriteTokens } : {}),
  };
}

/**
 * Build the per-canon-write delta for a freshly-committed assistant turn (one new message). `characterId`
 * null ⇒ `character_stats` is skipped. The model slice is decoupled from the scalar tokens (a later swipe
 * on a different model emits its own model-only delta).
 */
export function assistantTurnDelta(params: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId | null;
  readonly economics: TurnEconomicsInput;
  readonly now: number;
}): StatsDelta {
  const e = params.economics;
  const { model, provider } = statsModelKey(e.model ?? null, e.provider ?? null);
  const optional: Record<string, number> = {};
  setNum(optional, "tokensIn", e.tokensIn);
  setNum(optional, "tokensOut", e.tokensOut);
  setNum(optional, "cacheReadTokens", e.cacheReadTokens);
  setNum(optional, "cacheWriteTokens", e.cacheWriteTokens);
  setNum(optional, "costUsd", e.costUsd);
  setNum(optional, "genTimeMs", e.genTimeMs);
  setNum(optional, "dailyTokensIn", e.tokensIn);
  setNum(optional, "dailyTokensOut", e.tokensOut);
  // A reasoningGeneration counts only on trim().length > 0 (a whitespace-only thinking block is not one).
  const hasReasoning = typeof e.reasoning === "string" && e.reasoning.trim().length > 0;
  // #184: the measured reasoning window the turn stamped into the variant's metadata. Before it had a live
  // producer this was structurally always 0 here, which is why the new-slot builder never carried it while
  // the swipe/continue builders (reading the committed row) did — a drift that could not fire until now.
  const reasoningMs = reasoningMsOf(e.metadata ?? null);
  const tokenProvenance = tokenProvenanceOf(e);
  return {
    ownerId: params.ownerId,
    characterId: params.characterId,
    day: utcDay(params.now),
    model,
    provider,
    assistantTurns: 1,
    assistantWords: wordCount(e.content),
    contentBytes: e.content.length,
    genSamples: typeof e.genTimeMs === "number" ? 1 : 0,
    ...(hasReasoning ? { reasoningGenerations: 1 } : {}),
    ...(reasoningMs > 0 ? { reasoningMs } : {}),
    ...(has(e.contextWindow) ? { maxContextTokens: e.contextWindow } : {}),
    ...tokenSampleSlice({ prefix: "", provenance: tokenProvenance, tokensIn: e.tokensIn, tokensOut: e.tokensOut }),
    ...tokenSampleSlice({ prefix: "daily", provenance: tokenProvenance, tokensIn: e.tokensIn, tokensOut: e.tokensOut }),
    ...(has(e.costUsd) ? { costSamples: 1 } : {}),
    lastAt: params.now,
    now: params.now,
    ...optional,
    ...modelSliceFor(model, e),
  };
}

/**
 * Build the per-canon-write delta for a committed user message. `characterId` must be null: the rebuild's
 * per-character grain folds assistant slots only, so a user turn contributes to owner+day grains alone.
 */
export function userMessageDelta(params: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId | null;
  readonly content: string;
  readonly now: number;
}): StatsDelta {
  return {
    ownerId: params.ownerId,
    characterId: params.characterId,
    day: utcDay(params.now),
    model: null,
    provider: null,
    userTurns: 1,
    userWords: wordCount(params.content),
    contentBytes: params.content.length,
    lastAt: params.now,
    now: params.now,
  };
}

/** A cost-only rollup delta for a MANAGED-COMPACTION marker generation (a quiet, non-canon side-LLM call — no
 *  character, no model rollup, no turn counters). Rides the owner + daily cost totals so the compaction spend is
 *  VISIBLE on the stats surface (the quiet-op cost-visibility rule; the ExtractQuiet precedent returns cost, here
 *  the chat-owned generation lands it directly). `costUsd` absent/0 ⇒ a benign no-op delta. */
export function compactionCostDelta(params: { readonly ownerId: UserId; readonly costUsd: number; readonly now: number }): StatsDelta {
  return {
    ownerId: params.ownerId,
    characterId: null,
    day: utcDay(params.now),
    model: null,
    provider: null,
    costUsd: params.costUsd,
    costSamples: 1,
    lastAt: params.now,
    now: params.now,
  };
}

// Canon-mutator builders: start-chat/edit/delete/fork push their rollup delta into the same canon batch.
// Each mirrors the rebuild's folds with a SIGN so a delete emits the exact negative of the rebuild's
// contribution.

/** One canon row (slot ⋈ its selected variant) as the delta input — the same fields the rebuild's message
 *  stream reads. */
interface CanonRowInput {
  readonly characterId: CharacterId | null;
  readonly role: string;
  readonly createdAt: number;
  readonly content: string | null;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly tokenProvenance: TokenProvenance;
  readonly costUsd: number | null;
  readonly cacheReadTokens: number | null;
  readonly cacheWriteTokens: number | null;
  readonly contextWindow: number | null;
  readonly genStartedAt: number | null;
  readonly genFinishedAt: number | null;
  readonly model: string | null;
  readonly provider: string | null;
  readonly reasoning: string | null;
  /** The variant's PARSED sidecar (§5.3c class 3 — `parseVariantMetadata` at the query seam). `null` on the
   *  paths that build a row from something other than a committed variant read (an edit, a fork's source, a
   *  claim) and have no sidecar to carry. */
  readonly metadata: VariantMetadata | null;
  readonly selectedIdx: number | null;
  readonly variantCount: number;
}

/** One non-selected variant (a swipe) as the delta input — the rebuild's swipe stream fields. */
interface SwipeRowInput {
  readonly characterId: CharacterId | null;
  readonly msgCreatedAt: number;
  readonly content: string | null;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly tokenProvenance: TokenProvenance;
  readonly genStartedAt: number | null;
  readonly genFinishedAt: number | null;
  readonly model: string | null;
  readonly provider: string | null;
  readonly reasoning: string | null;
  /** The variant's PARSED sidecar — the {@link CanonRowInput.metadata} twin. */
  readonly metadata: VariantMetadata | null;
}

/** metadata.reasoning_duration as non-negative rounded ms, or 0 (mirrors the rebuild's `reasoningMsOf`).
 *  The key has ONE home (`VARIANT_METADATA_REASONING_MS_KEY`), shared with the live turn's writer — this
 *  reader is exactly the half that had no live producer until #184. The blob arrives PARSED
 *  (`parseVariantMetadata` at the query seam), so the value is already `number | undefined`: the finite
 *  guard is about the VALUE (a negative or zero window is not a measurement), never about the type. */
function reasoningMsOf(metadata: VariantMetadata | null): number {
  const d = metadata?.[VARIANT_METADATA_REASONING_MS_KEY];
  return d !== undefined && Number.isFinite(d) && d > 0 ? Math.round(d) : 0;
}

/** The completed gen window (gf−gs) when both bounds are present and ordered, else null (rebuild twin). */
function genDurationMs(gs: number | null, gf: number | null): number | null {
  return gs !== null && gf !== null && gf >= gs ? gf - gs : null;
}

/** A non-empty reasoning snapshot was recorded (rebuild twin). */
function hasReasoningText(reasoning: string | null): boolean {
  return reasoning !== null && reasoning.trim().length > 0;
}

/**
 * The full contribution of one canon message (its selected variant) as a signed delta — the live mirror
 * of the rebuild's `foldMessage`. `sign:-1` is the delete-messages arm; `lastAt` re-floats to `now` (an
 * extremum can't be subtracted, the next reconcile settles it). `maxContextTokens` is carried only on
 * `+1` (a MAX candidate can't be retracted).
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a flat signed field-mapping of the rebuild's fold — every ternary is one column, no nesting; splitting it would scatter the drift-gate mirror.
export function canonMessageDelta(params: { readonly ownerId: UserId; readonly row: CanonRowInput; readonly sign: 1 | -1; readonly now: number }): StatsDelta {
  const { row, sign } = params;
  const isUser = row.role === "user";
  const isAssistant = row.role === "assistant";
  const words = wordCount(row.content ?? "") * sign;
  const gen = genDurationMs(row.genStartedAt, row.genFinishedAt);
  const reasoningMs = reasoningMsOf(row.metadata) * sign;
  const { model, provider } = statsModelKey(row.model, row.provider);
  const creditsModel = isAssistant && row.model !== null;
  const tokensIn = (row.tokensIn ?? 0) * sign;
  const tokensOut = (row.tokensOut ?? 0) * sign;
  const costUsd = (row.costUsd ?? 0) * sign;
  const cacheR = (row.cacheReadTokens ?? 0) * sign;
  const cacheW = (row.cacheWriteTokens ?? 0) * sign;
  const settled = row.variantCount > 1 && row.selectedIdx !== null;
  const reasoningGen = isAssistant && hasReasoningText(row.reasoning) ? sign : 0;
  return {
    ownerId: params.ownerId,
    // Per-char grain is assistant-only (the rebuild's foldMessageChar) — a user/system row is owner+day.
    characterId: isAssistant ? row.characterId : null,
    day: utcDay(row.createdAt),
    model: creditsModel ? model : null,
    provider: creditsModel ? provider : null,
    userTurns: isUser ? sign : 0,
    assistantTurns: isAssistant ? sign : 0,
    systemTurns: row.role === "system" ? sign : 0,
    userWords: isUser ? words : 0,
    // Non-user (assistant + system) words land in assistantWords.
    assistantWords: isUser ? 0 : words,
    contentBytes: (row.content?.length ?? 0) * sign,
    tokensIn,
    tokensOut,
    dailyTokensIn: tokensIn,
    dailyTokensOut: tokensOut,
    ...tokenSampleSlice({ prefix: "", provenance: row.tokenProvenance, tokensIn: row.tokensIn, tokensOut: row.tokensOut, sign }),
    ...tokenSampleSlice({ prefix: "daily", provenance: row.tokenProvenance, tokensIn: row.tokensIn, tokensOut: row.tokensOut, sign }),
    costUsd,
    costSamples: row.costUsd !== null ? sign : 0,
    cacheReadTokens: cacheR,
    cacheWriteTokens: cacheW,
    reasoningMs,
    genTimeMs: gen !== null ? gen * sign : 0,
    genSamples: gen !== null ? sign : 0,
    reasoningGenerations: reasoningGen,
    variantMessages: settled ? sign : 0,
    activeIdxSum: settled ? row.selectedIdx * sign : 0,
    ...(sign > 0 && row.contextWindow !== null ? { maxContextTokens: row.contextWindow } : {}),
    lastAt: sign > 0 ? row.createdAt : params.now,
    now: params.now,
    ...canonModelSlice(creditsModel, {
      sign,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      gen,
      reasoningGen,
      reasoningMs,
      costUsd,
      costSamples: row.costUsd !== null ? sign : 0,
      tokenProvenance: row.tokenProvenance,
      cacheR,
      cacheW,
    }),
  };
}

/** The model slice of {@link canonMessageDelta}. Empty when the row credits no model bucket. */
function canonModelSlice(
  creditsModel: boolean,
  v: {
    readonly sign: 1 | -1;
    readonly tokensIn: number | null;
    readonly tokensOut: number | null;
    readonly gen: number | null;
    readonly reasoningGen: number;
    readonly reasoningMs: number;
    readonly costUsd: number;
    readonly costSamples: number;
    readonly tokenProvenance: TokenProvenance;
    readonly cacheR: number;
    readonly cacheW: number;
  },
): Partial<StatsDelta> {
  if (!creditsModel) {
    return {};
  }
  return {
    modelGenerations: v.sign,
    modelTokensIn: (v.tokensIn ?? 0) * v.sign,
    modelTokensOut: (v.tokensOut ?? 0) * v.sign,
    ...tokenSampleSlice({ prefix: "model", provenance: v.tokenProvenance, tokensIn: v.tokensIn, tokensOut: v.tokensOut, sign: v.sign }),
    modelGenTimeMs: v.gen !== null ? v.gen * v.sign : 0,
    modelGenSamples: v.gen !== null ? v.sign : 0,
    modelReasoningGenerations: v.reasoningGen,
    modelReasoningMs: v.reasoningMs,
    modelCostUsd: v.costUsd,
    modelCostSamples: v.costSamples,
    modelCacheReadTokens: v.cacheR,
    modelCacheWriteTokens: v.cacheW,
  };
}

/**
 * The contribution of one non-selected variant (a swipe) as a signed delta — the live mirror of the
 * rebuild's `foldSwipe`/`foldSwipeChar`: swipes credit the re-roll counters + scalar tokens but not the
 * daily token slice, and their model bucket carries no cost/cache.
 */
export function swipeVariantDelta(params: { readonly ownerId: UserId; readonly row: SwipeRowInput; readonly sign: 1 | -1; readonly now: number }): StatsDelta {
  const { row, sign } = params;
  const gen = genDurationMs(row.genStartedAt, row.genFinishedAt);
  const reasoningMs = reasoningMsOf(row.metadata) * sign;
  const { model, provider } = statsModelKey(row.model, row.provider);
  const creditsModel = row.model !== null;
  const tokensIn = (row.tokensIn ?? 0) * sign;
  const tokensOut = (row.tokensOut ?? 0) * sign;
  const reasoningGen = hasReasoningText(row.reasoning) ? sign : 0;
  return {
    ownerId: params.ownerId,
    characterId: row.characterId,
    day: utcDay(row.msgCreatedAt),
    model: creditsModel ? model : null,
    provider: creditsModel ? provider : null,
    swipes: sign,
    swipeWords: wordCount(row.content ?? "") * sign,
    contentBytes: (row.content?.length ?? 0) * sign,
    tokensIn,
    tokensOut,
    ...tokenSampleSlice({ prefix: "", provenance: row.tokenProvenance, tokensIn: row.tokensIn, tokensOut: row.tokensOut, sign }),
    reasoningMs,
    genTimeMs: gen !== null ? gen * sign : 0,
    genSamples: gen !== null ? sign : 0,
    reasoningGenerations: reasoningGen,
    now: params.now,
    ...(creditsModel
      ? {
          modelGenerations: sign,
          modelTokensIn: tokensIn,
          modelTokensOut: tokensOut,
          ...tokenSampleSlice({ prefix: "model", provenance: row.tokenProvenance, tokensIn: row.tokensIn, tokensOut: row.tokensOut, sign }),
          modelGenTimeMs: gen !== null ? gen * sign : 0,
          modelGenSamples: gen !== null ? sign : 0,
          modelReasoningGenerations: reasoningGen,
          modelReasoningMs: reasoningMs,
        }
      : {}),
  };
}

/**
 * The chat-created contribution of a room's PRIMARY seat (`start-chat`/`fork`): the owner-grain +1 chats
 * and +1 daily chatsCreated that the room itself contributes, PLUS that seat's own census bump
 * ({@link seatChatDelta}'s payload), the fork lineage counters, and the firstAt/lastAt extrema candidates.
 *
 * EVERY OTHER SEAT RIDES ONE {@link seatChatDelta} (#1147) — the room counts ONCE for the owner and ONCE
 * PER SEAT for the census, which is exactly what the rebuild derives
 * (`rebuild-from-canon.ts::loadChatMeta`, `COUNT(DISTINCT cp.chat_id)` per character).
 *
 * @remarks `newCharacter` is `true` when this creation is the primary character's first chat. A fork is
 *  never a first chat.
 */
export function chatCreatedDelta(params: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId | null;
  readonly forked: boolean;
  readonly newCharacter: boolean;
  readonly now: number;
}): StatsDelta {
  return {
    ...seatChatDelta(params),
    chats: 1,
    chatsCreated: 1,
    ...(params.forked ? { forkedChats: 1 } : {}),
  };
}

/**
 * The contribution of ONE character SEAT in a room: the per-character room census (+1 on the seat's
 * `chats` column, +1 its fork counter when the room is a fork) and that character's first/last-chat
 * extrema candidates, plus the `owner_stats.characters` bump when this is the character's first chat.
 *
 * It carries NO owner-grain `chats`/`chatsCreated`: the room is one room however many characters sit in it,
 * so only the primary seat's {@link chatCreatedDelta} counts it for the owner and the day. Used for every
 * founding seat past the first (`verbs/claim-chat.ts`), every copied seat of a fork (`verbs/fork.ts`), and
 * a character seated into a live room (`verbs/participants.ts::addCharacterToChat`).
 */
export function seatChatDelta(params: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId | null;
  readonly forked: boolean;
  readonly newCharacter: boolean;
  readonly now: number;
}): StatsDelta {
  return {
    ownerId: params.ownerId,
    characterId: params.characterId,
    day: utcDay(params.now),
    model: null,
    provider: null,
    characterChats: 1,
    ...(params.forked ? { characterForkedChats: 1 } : {}),
    ...(params.newCharacter ? { newCharacter: true } : {}),
    firstAt: params.now,
    lastAt: params.now,
    now: params.now,
  };
}

/**
 * The net contribution of an in-place content edit: `words(new) − words(old)` on the role bucket + the
 * byte diff, bucketed on the slot's original day (the rebuild folds by `createdAt`, not the edit time).
 */
export function editMessageDelta(params: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId | null;
  readonly role: string;
  readonly createdAt: number;
  readonly oldContent: string;
  readonly newContent: string;
  readonly now: number;
}): StatsDelta {
  const isUser = params.role === "user";
  const isAssistant = params.role === "assistant";
  const wordsDiff = wordCount(params.newContent) - wordCount(params.oldContent);
  const bytesDiff = params.newContent.length - params.oldContent.length;
  return {
    ownerId: params.ownerId,
    characterId: isAssistant ? params.characterId : null,
    day: utcDay(params.createdAt),
    model: null,
    provider: null,
    userWords: isUser ? wordsDiff : 0,
    assistantWords: isUser ? 0 : wordsDiff,
    contentBytes: bytesDiff,
    lastAt: params.now,
    now: params.now,
  };
}

/** The net reasoning-presence contribution of an in-place selected-variant edit. Rebuild counts a
 *  generation only for a non-blank assistant reasoning body; text changes within the same presence arm are
 *  a zero delta, but still pass through the live writer so the canon-version fence advances atomically. */
export function editReasoningDelta(params: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId | null;
  readonly role: string;
  readonly createdAt: number;
  readonly model: string | null;
  readonly provider: string | null;
  readonly oldReasoning: string | null;
  readonly newReasoning: string | null;
  readonly now: number;
}): StatsDelta {
  const assistant = params.role === "assistant";
  const present = (value: string | null): number => Number(value !== null && value.trim().length > 0);
  const diff = assistant ? present(params.newReasoning) - present(params.oldReasoning) : 0;
  return {
    ownerId: params.ownerId,
    characterId: assistant ? params.characterId : null,
    day: utcDay(params.createdAt),
    ...statsModelKey(assistant ? params.model : null, assistant ? params.provider : null),
    reasoningGenerations: diff,
    modelReasoningGenerations: diff,
    now: params.now,
  };
}
