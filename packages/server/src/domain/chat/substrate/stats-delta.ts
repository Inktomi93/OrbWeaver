// domain/chat/substrate/stats-delta — the StatsDelta BUILDERS ("stats-delta
// builders STAY chat; applyStatsDelta injected"). RELOCATED engine/ → substrate/ when the canon-mutator
// verbs became consumers (start-chat/edit/delete/fork push too — the
// `domain-substrate-mediates-subsystems` gate homes verb-shared pure helpers HERE, not in a named
// subsystem). The builders are chat's; the APPLY is the injected
// `ctx.applyStatsDelta` (the upsert into the four rollup tables — `domain/stats`), pushed into the SAME
// `db.batch` as the canon write so the rollups stay fresh with no rebuild.
//
// THE DRIFT GATE: a builder computes the CHANGE its write makes — an APPEND (a new
// message) emits the new contribution. The SAME `@orb/kit/stats-tally` primitives (`wordCount`/`utcDay`/
// `modelKey`) run here AND in `reconcileStats`, so the live delta can never drift from a rebuild.
//
// OWNER = `runAsUserId` (the host whose box funds + owns the turn — stats are per-owner; D17/§5). The
// economics (tokens/cost/cache) are the host's spend. `triggeredBy` is the BUDGET axis (engine/budget.ts),
// NOT the stats owner — they differ in a hosted by-proxy turn.

import type { StatsDelta } from "@orb/contracts/stats";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { modelKey, utcDay, wordCount } from "@orb/kit/stats-tally";

/** The committed economics a turn-delta builder reads (the pipeline's reduced `final` chunk + timings). All
 *  nullable — an unreported field contributes nothing (a sparse patch; never a fabricated zero). */
interface TurnEconomicsInput {
  readonly content: string;
  readonly reasoning?: string | null | undefined;
  readonly model?: string | null | undefined;
  readonly provider?: string | null | undefined;
  readonly tokensIn?: number | null | undefined;
  readonly tokensOut?: number | null | undefined;
  readonly cacheReadTokens?: number | null | undefined;
  readonly cacheWriteTokens?: number | null | undefined;
  readonly costUsd?: number | null | undefined;
  readonly genTimeMs?: number | null | undefined;
}

/** Set `target[key]` only when `value` is a real number (omit absent economics — the sparse-patch contract;
 *  the apply coalesces an omitted field to 0 / skips the extremum). */
function setNum(
  target: Record<string, number>,
  key: string,
  value: number | null | undefined,
): void {
  if (typeof value === "number") {
    target[key] = value;
  }
}

/** True when `v` is a real number (the sparse-patch include test for a conditional object spread). */
function has(v: number | null | undefined): v is number {
  return typeof v === "number";
}

/** The DECOUPLED model_stats slice (null model ⇒ `{}` — apply skips the model row). Built with object-literal
 *  KEYS so the high-entropy `model*` field names never appear as STRING literals (biome `noSecrets`). */
function modelSliceFor(model: string | null, e: TurnEconomicsInput): Record<string, number> {
  if (model === null) {
    return {};
  }
  return {
    modelGenerations: 1,
    modelGenSamples: 1,
    ...(has(e.tokensIn) ? { modelTokensIn: e.tokensIn } : {}),
    ...(has(e.tokensOut) ? { modelTokensOut: e.tokensOut } : {}),
    ...(has(e.costUsd) ? { modelCostUsd: e.costUsd } : {}),
    ...(has(e.genTimeMs) ? { modelGenTimeMs: e.genTimeMs } : {}),
    ...(has(e.cacheReadTokens) ? { modelCacheReadTokens: e.cacheReadTokens } : {}),
    ...(has(e.cacheWriteTokens) ? { modelCacheWriteTokens: e.cacheWriteTokens } : {}),
  };
}

/**
 * Build the per-canon-write delta for a freshly-committed ASSISTANT turn (one new message — the new
 * contribution). `characterId` null ⇒ `character_stats` is skipped (the narrator/group rows always carry a
 * real id — Part III §10 — so this is null only for a non-character assistant write). The model slice is
 * DECOUPLED from the scalar tokens (a later swipe on a different model emits its own model-only delta).
 */
export function assistantTurnDelta(params: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId | null;
  readonly economics: TurnEconomicsInput;
  readonly now: number;
}): StatsDelta {
  const e = params.economics;
  const { model, provider } = modelKey(e.model ?? null, e.provider ?? null);
  const optional: Record<string, number> = {};
  setNum(optional, "tokensIn", e.tokensIn);
  setNum(optional, "tokensOut", e.tokensOut);
  setNum(optional, "cacheReadTokens", e.cacheReadTokens);
  setNum(optional, "cacheWriteTokens", e.cacheWriteTokens);
  setNum(optional, "costUsd", e.costUsd);
  setNum(optional, "genTimeMs", e.genTimeMs);
  // DAILY slice (decoupled from scalar tokens — daily credits the message stream).
  setNum(optional, "dailyTokensIn", e.tokensIn);
  setNum(optional, "dailyTokensOut", e.tokensOut);
  const hasReasoning = typeof e.reasoning === "string" && e.reasoning.length > 0;
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
    lastAt: params.now,
    now: params.now,
    ...optional,
    ...modelSliceFor(model, e),
  };
}

/**
 * Build the per-canon-write delta for a committed USER message (the send verb's contribution — co-located
 * here so the user + assistant builders share the one tally home). `characterId` MUST be null under the
 * drift gate: the rebuild's per-character grain folds ASSISTANT slots only (`foldMessageChar`), so a user
 * turn contributes to owner+day grains alone.
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

// ═══ Canon-mutator builders (the cross-feature composition: start-chat / edit / delete / fork ═══
// push their rollup delta into the SAME canon batch). Each mirrors `reconcileStats`'s folds over the D26
// canon (rebuild-from-canon.ts foldMessage/foldSwipe) with a SIGN so a delete emits the exact negative of
// the rebuild's contribution — the drift-gate contract (stats inv #3).

/** One canon row (slot ⋈ its SELECTED variant) as the delta input — the same fields the rebuild's message
 *  stream reads. File-local shape (types-in-contract): callers pass structurally-matching literals. */
interface CanonRowInput {
  readonly characterId: CharacterId | null;
  readonly role: string;
  readonly createdAt: number;
  readonly content: string | null;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly costUsd: number | null;
  readonly cacheReadTokens: number | null;
  readonly cacheWriteTokens: number | null;
  readonly contextWindow: number | null;
  readonly genStartedAt: number | null;
  readonly genFinishedAt: number | null;
  readonly model: string | null;
  readonly provider: string | null;
  readonly reasoning: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly selectedIdx: number | null;
  readonly variantCount: number;
}

/** One NON-selected variant (a swipe) as the delta input — the rebuild's swipe stream fields. */
interface SwipeRowInput {
  readonly characterId: CharacterId | null;
  readonly msgCreatedAt: number;
  readonly content: string | null;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly genStartedAt: number | null;
  readonly genFinishedAt: number | null;
  readonly model: string | null;
  readonly provider: string | null;
  readonly reasoning: string | null;
  readonly metadata: Record<string, unknown> | null;
}

/** metadata.reasoning_duration as non-negative rounded ms, or 0 (mirrors the rebuild's `reasoningMsOf`). */
function reasoningMsOf(metadata: Record<string, unknown> | null): number {
  const d = Number(metadata?.["reasoning_duration"]);
  return Number.isFinite(d) && d > 0 ? Math.round(d) : 0;
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
 * The full contribution of ONE canon message (its SELECTED variant) as a signed delta — the live mirror of
 * the rebuild's `foldMessage` (owner + day + per-char [assistant-only] + model [assistant-only] grains in
 * one payload; the apply fans it to the four tables). `sign:-1` = the delete-messages arm (the exact
 * negative of the row's rebuild contribution; `lastAt` re-floats to `now` — an extremum can't be
 * subtracted, the next reconcile settles it). `maxContextTokens` is carried only on `+1` (a MAX candidate
 * can't be retracted).
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a flat signed field-mapping of the rebuild's fold — every ternary is one column, no nesting; splitting it would scatter the drift-gate mirror.
export function canonMessageDelta(params: {
  readonly ownerId: UserId;
  readonly row: CanonRowInput;
  readonly sign: 1 | -1;
  readonly now: number;
}): StatsDelta {
  const { row, sign } = params;
  const isUser = row.role === "user";
  const isAssistant = row.role === "assistant";
  const words = wordCount(row.content ?? "") * sign;
  const gen = genDurationMs(row.genStartedAt, row.genFinishedAt);
  const reasoningMs = reasoningMsOf(row.metadata) * sign;
  const { model, provider } = modelKey(row.model, row.provider);
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
    // Non-user (assistant + system) words land in assistantWords (the rebuild's binary is_user split).
    assistantWords: isUser ? 0 : words,
    contentBytes: (row.content?.length ?? 0) * sign,
    tokensIn,
    tokensOut,
    dailyTokensIn: tokensIn,
    dailyTokensOut: tokensOut,
    costUsd,
    cacheReadTokens: cacheR,
    cacheWriteTokens: cacheW,
    reasoningMs,
    genTimeMs: gen !== null ? gen * sign : 0,
    genSamples: gen !== null ? sign : 0,
    reasoningGenerations: reasoningGen,
    variantMessages: settled ? sign : 0,
    activeIdxSum: settled ? (row.selectedIdx ?? 0) * sign : 0,
    ...(sign > 0 && row.contextWindow !== null ? { maxContextTokens: row.contextWindow } : {}),
    lastAt: sign > 0 ? row.createdAt : params.now,
    now: params.now,
    ...canonModelSlice(creditsModel, {
      sign,
      tokensIn,
      tokensOut,
      gen,
      reasoningGen,
      reasoningMs,
      costUsd,
      cacheR,
      cacheW,
    }),
  };
}

/** The model slice of {@link canonMessageDelta} (cost/cache included — the rebuild's message-stream model
 *  fold). Empty when the row credits no model bucket. */
function canonModelSlice(
  creditsModel: boolean,
  v: {
    readonly sign: 1 | -1;
    readonly tokensIn: number;
    readonly tokensOut: number;
    readonly gen: number | null;
    readonly reasoningGen: number;
    readonly reasoningMs: number;
    readonly costUsd: number;
    readonly cacheR: number;
    readonly cacheW: number;
  },
): Partial<StatsDelta> {
  if (!creditsModel) {
    return {};
  }
  return {
    modelGenerations: v.sign,
    modelTokensIn: v.tokensIn,
    modelTokensOut: v.tokensOut,
    modelGenTimeMs: v.gen !== null ? v.gen * v.sign : 0,
    modelGenSamples: v.gen !== null ? v.sign : 0,
    modelReasoningGenerations: v.reasoningGen,
    modelReasoningMs: v.reasoningMs,
    modelCostUsd: v.costUsd,
    modelCacheReadTokens: v.cacheR,
    modelCacheWriteTokens: v.cacheW,
  };
}

/**
 * The contribution of ONE non-selected variant (a swipe) as a signed delta — the live mirror of the
 * rebuild's `foldSwipe`/`foldSwipeChar`: swipes credit the re-roll counters + scalar tokens but NOT the
 * daily token slice, and their model bucket carries no cost/cache (the rebuild's `foldModelGen`-only arm).
 */
export function swipeVariantDelta(params: {
  readonly ownerId: UserId;
  readonly row: SwipeRowInput;
  readonly sign: 1 | -1;
  readonly now: number;
}): StatsDelta {
  const { row, sign } = params;
  const gen = genDurationMs(row.genStartedAt, row.genFinishedAt);
  const reasoningMs = reasoningMsOf(row.metadata) * sign;
  const { model, provider } = modelKey(row.model, row.provider);
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
          modelGenTimeMs: gen !== null ? gen * sign : 0,
          modelGenSamples: gen !== null ? sign : 0,
          modelReasoningGenerations: reasoningGen,
          modelReasoningMs: reasoningMs,
        }
      : {}),
  };
}

/**
 * The chat-CREATED contribution (`start-chat` / `fork`): +1 chats (per-char [the primary] + per-owner),
 * +1 daily chatsCreated, the fork lineage counter, and the firstAt/lastAt extrema candidates. GROUP edge
 * (PD-21, decided): a multi-character room bumps only the PRIMARY character's per-char `chats` here — the
 * rebuild counts every participant character's chats, so a reconcile settles the extra per-char rows; the
 * owner/day grains are exact either way (one delta cannot bump per-char chats for N characters without
 * over-bumping the owner's — the same field drives both grains). Owner-attribution itself is exact: v1
 * enforces single-owner-per-chat (roster characters are host-owned — see rebuild-from-canon.ts header).
 */
export function chatCreatedDelta(params: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId | null;
  readonly forked: boolean;
  readonly now: number;
}): StatsDelta {
  // FLAG[PD-96]: this is the first-chat site, but the delta omits `newCharacter`, so live
  // `owner_stats.characters` never increments — it stays 0 until a reconcile. Wiring it needs a
  // "first chat for this character?" existence check (here or in start-chat) before setting newCharacter.
  return {
    ownerId: params.ownerId,
    characterId: params.characterId,
    day: utcDay(params.now),
    model: null,
    provider: null,
    chats: 1,
    chatsCreated: 1,
    ...(params.forked ? { forkedChats: 1 } : {}),
    firstAt: params.now,
    lastAt: params.now,
    now: params.now,
  };
}

/**
 * The NET contribution of an in-place content edit (`editMessage` — D26: the selected variant's content
 * changes, nothing else): `words(new) − words(old)` on the role bucket + the byte diff, bucketed on the
 * slot's ORIGINAL day (the rebuild folds by `createdAt`, not the edit time).
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
