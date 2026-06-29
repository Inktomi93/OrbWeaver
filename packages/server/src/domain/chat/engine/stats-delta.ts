// domain/chat/engine/stats-delta — the StatsDelta BUILDERS (chat.md movement table: "engine/stats-delta.ts
// builders STAY chat; applyStatsDelta injected"). The builders are chat's; the APPLY is the injected
// `ctx.applyStatsDelta` (the upsert into the four rollup tables — `domain/stats`), pushed into the SAME
// `db.batch` as the canon write so the rollups stay fresh with no rebuild.
//
// THE DRIFT GATE (stats.md inv #3): a builder computes the CHANGE its write makes — an APPEND (a new
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

/** The DECOUPLED model_stats slice (null model ⇒ {} — apply skips the model row). Built with object-literal
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
 * here so the user + assistant builders share the one tally home). `personaId` does not key stats; the user
 * counters are per-owner (+ per-character of the chat's primary — passed by the caller, null ⇒ owner-only).
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
    lastAt: params.now,
    now: params.now,
  };
}
