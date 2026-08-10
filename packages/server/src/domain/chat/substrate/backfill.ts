// domain/chat/substrate/backfill — the corpus-wide maintenance sweeps the workloads engine drives. Two
// sweeps, both @public composition-root helpers, homed in `substrate/` because they coordinate the
// `memory/` subsystem + `persistence/` reads.
//
//   - `backfillMemory` — enumerate every chat, run the segment build, then the digest build per scope
//     bucket, mirroring the engine's post-turn enumeration. Per-chat builds are already idempotent/
//     self-healing, so the sweep is resumable. A `mode:"off"` host's chat is skipped entirely.
//   - `backfillGroupCharacters` — mint the synthetic group character for every >1-character room that
//     lacks one. Idempotent: `findSyntheticGroupCharacter` short-circuits an existing mint.
//
// Cooperative abort: the signal is checked between chats/buckets — a partial sweep is safe.
//
// The shared group-bucket FK is structurally satisfied, not caught (#41): `scopesFor` resolves the shared
// bucket's `scopedCharacterId` through `resolveGroupBucketCharacterId`, which is find-OR-MINT — it persists
// the synthetic group `characters` row (via `ctx.mintSyntheticGroupCharacter`) BEFORE any digest write, so
// the `chat_digests.scopedCharacterId` FK can never dangle here. The row's existence is a precondition the
// sweep MINTS, not an assumption it hopes for; `backfillGroupCharacters` is a separate warm-up, not the
// guarantee. And because that precondition is minted inline, the per-chat isolation catch below is NOT a
// silent-skip engine: an isolated chat is COUNTED (`failed`) and logged at `error` level — see there.

import { buildCastNameContext } from "@orb/contracts/chat";
import type { SummarizeInput } from "@orb/contracts/role-clients";
import { chatParticipants, chats } from "@orb/db";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import type { RowMacroNameContext } from "@orb/kit/macro";
import { and, eq, isNull } from "drizzle-orm";
import { getLog } from "#foundation/observability";
import type { ChatContext } from "../context.ts";
import type { BackfillPassCounts, MemoryBackfillCounts, MemoryScope, ResolveBackfillMemoryConfig } from "../contract/memory.ts";
import {
  collectConsolidationTier,
  logBuild,
  planDigests,
  storeConsolidationTier,
  storeTier0,
  summarizeConsolidationBatch,
  summarizeDigestBatch,
} from "../memory/build/digests.ts";
import { generateSegments } from "../memory/build/segments.ts";
import { loadWitnessHorizons } from "../memory/persistence/queries.ts";
import { loadChatCastProducer } from "../persistence/cast.ts";
import { loadRoster } from "../persistence/roster.ts";
import { resolveGroupBucketCharacterId } from "./group-bucket.ts";
import { hostUserIdOf } from "./roster-host.ts";

/** The sweep universe (temporary chats included; they are live rooms until reaped). `ownerId` scopes to
 *  the chats that user hosts (a present, non-departed host participant); omitted/null = every chat. */
async function loadAllChatIds(ctx: ChatContext, hostUserId?: UserId | null): Promise<ChatId[]> {
  if (hostUserId === undefined || hostUserId === null) {
    const rows = await ctx.db.select({ id: chats.id }).from(chats);
    return rows.map((r) => r.id);
  }
  const rows = await ctx.db
    .select({ id: chats.id })
    .from(chats)
    .innerJoin(
      chatParticipants,
      and(
        eq(chatParticipants.chatId, chats.id),
        eq(chatParticipants.kind, "human"),
        eq(chatParticipants.role, "host"),
        eq(chatParticipants.userId, hostUserId),
        isNull(chatParticipants.leftSeq),
      ),
    );
  return rows.map((r) => r.id);
}

/** A chat's present cast + its host + the projected macro-name context (the summarizer transcript labels
 *  resolve by character/persona name, not the raw id). One roster read serves all three. */
async function loadCastAndHost(
  ctx: ChatContext,
  chatId: ChatId,
): Promise<{
  cast: CharacterId[];
  hostUserId: UserId | null;
  macroNames: RowMacroNameContext;
}> {
  const roster = await loadRoster(ctx.db, chatId);
  const cast = roster.flatMap((r) => (r.kind === "character" && r.characterId !== null ? [r.characterId] : []));
  const hostUserId = hostUserIdOf(roster);
  const macroNames: RowMacroNameContext = buildCastNameContext(await loadChatCastProducer(ctx.db, { participants: roster }));
  return { cast, hostUserId, macroNames };
}

/** The digest scope buckets for one chat — mirrors the engine's post-turn enumeration: the shared group
 *  bucket gated on cast size (no-op for solo), then every cast character's bucket. A hostless group has
 *  no funding owner to mint under, so its shared bucket is skipped (per-character buckets still build). */
async function scopesFor(ctx: ChatContext, chatId: ChatId, cast: readonly CharacterId[], hostUserId: UserId | null): Promise<MemoryScope[]> {
  const scopes: MemoryScope[] = [];
  if (cast.length > 1 && hostUserId !== null) {
    const scopedCharacterId = await resolveGroupBucketCharacterId(ctx, {
      ownerId: hostUserId,
      chatId,
    });
    scopes.push({ chatId, scopedCharacterId, isGroup: cast.length > 1 });
  }
  for (const scopedCharacterId of cast) {
    scopes.push({ chatId, scopedCharacterId, isGroup: cast.length > 1 });
  }
  return scopes;
}

/** The digest plan `planDigests` produces (PHASE 1) and PHASE 3/4 consume (`storeTier0` + consolidation) —
 *  derived by inference so this build-internal orchestration type stays out of a substrate export
 *  (no-inline-types: exported types live in a type home). */
type DigestPlan = NonNullable<Awaited<ReturnType<typeof planDigests>>>;

/** The PHASE-1 fold: the collected plans + the running segment/digest scan counts + failure tally. */
interface PlanSweep {
  readonly plans: DigestPlan[];
  segmentsScanned: number;
  segmentsChanged: number;
  digestsScanned: number;
  failed: number;
}

/** The per-chat plan dependencies (bundled to keep `planOneChat` at ≤4 params). */
interface PlanDeps {
  readonly signal: AbortSignal;
  readonly resolveMemoryConfig: ResolveBackfillMemoryConfig;
}

/** Plan ONE chat: build its segments, then tier-0 COLLECT each of its scope buckets into `sweep`. No summarize. */
async function planOneChat(ctx: ChatContext, deps: PlanDeps, chatId: ChatId, sweep: PlanSweep): Promise<void> {
  const { cast, hostUserId, macroNames } = await loadCastAndHost(ctx, chatId);
  // Resolved inside the per-chat try (the caller's) so a settings-read failure is counted + continues.
  const config = hostUserId === null ? null : await deps.resolveMemoryConfig(hostUserId);
  if (config?.mode === "off") {
    return; // the host disabled memory — skip enumerate/mint/plan entirely.
  }
  const seg = await generateSegments(ctx, { chatId, config, macroNames, signal: deps.signal });
  sweep.segmentsScanned += 1;
  sweep.segmentsChanged += seg.written;
  const castSet = new Set<CharacterId>(cast);
  for (const scope of await scopesFor(ctx, chatId, cast, hostUserId)) {
    if (deps.signal.aborted) {
      break;
    }
    // biome-ignore lint/performance/noAwaitInLoops: sequential — the per-scope shrink-reclaim writes inside planDigests must not race.
    const witnessing = castSet.has(scope.scopedCharacterId) ? await loadWitnessHorizons(ctx.db, chatId, scope.scopedCharacterId) : undefined;
    const plan = await planDigests(ctx, { scope, config, macroNames, signal: deps.signal, ...(witnessing !== undefined ? { witnessing } : {}) });
    sweep.digestsScanned += 1; // each (chat × scope) bucket is one scanned unit, planned or a no-op
    if (plan !== null) {
      sweep.plans.push(plan);
    }
  }
}

/** PHASE 1 — plan every (chat × scope) bucket corpus-wide (segments + tier-0 collect; NO summarize). One
 *  poisoned chat is counted + logged, never kills the sweep (#41 — every EXPECTED branch returns without
 *  throwing, so a throw landing in the catch is a genuine unexpected fault). */
async function planAllBuckets(
  ctx: ChatContext,
  args: { readonly signal: AbortSignal; readonly ownerId?: UserId | null },
  resolveMemoryConfig: ResolveBackfillMemoryConfig,
): Promise<PlanSweep> {
  const sweep: PlanSweep = { plans: [], segmentsScanned: 0, segmentsChanged: 0, digestsScanned: 0, failed: 0 };
  const deps: PlanDeps = { signal: args.signal, resolveMemoryConfig };
  for (const chatId of await loadAllChatIds(ctx, args.ownerId)) {
    if (args.signal.aborted) {
      break; // cooperative abort between chats — every completed unit is durable + idempotent
    }
    try {
      // biome-ignore lint/performance/noAwaitInLoops: the plan sweep is sequential by design — parallel chats would race the db + the per-scope shrink-reclaim writes.
      await planOneChat(ctx, deps, chatId, sweep);
    } catch (err) {
      sweep.failed += 1;
      getLog().error({ err, chatId }, "memory backfill: chat FAILED during plan and was skipped (unexpected error)");
    }
  }
  return sweep;
}

/** The length-sorted input list for the corpus batch (`order` holds indices into `flat`, sorted by length). */
function orderedInputs(flat: readonly { readonly input: SummarizeInput }[], order: readonly number[]): SummarizeInput[] {
  const out: SummarizeInput[] = [];
  for (const i of order) {
    const f = flat[i];
    if (f !== undefined) {
      out.push(f.input);
    }
  }
  return out;
}

/** PHASE 2 — summarize the WHOLE corpus's tier-0 blocks in ONE length-sorted batch (similar-length sequences
 *  pack into vLLM's continuous batches with less ragged-batch padding; feeding all at once keeps the batcher
 *  saturated instead of ramping a tiny batch per bucket). Returns each plan's texts, index-aligned to its
 *  pending order (the summarize surface's own per-item isolation still contains a poison block). */
async function summarizeAllPending(ctx: ChatContext, plans: readonly DigestPlan[]): Promise<(string | null)[][]> {
  const flat: { readonly planIdx: number; readonly input: SummarizeInput }[] = [];
  for (let pi = 0; pi < plans.length; pi += 1) {
    for (const item of plans[pi]?.pending ?? []) {
      flat.push({ planIdx: pi, input: item.input });
    }
  }
  const order = flat.map((_, i) => i).sort((a, b) => inputLen(flat[a]?.input) - inputLen(flat[b]?.input));
  const sortedTexts = await summarizeDigestBatch(ctx, orderedInputs(flat, order));
  const flatTexts: (string | null)[] = new Array(flat.length).fill(null);
  order.forEach((origIdx, k) => {
    flatTexts[origIdx] = sortedTexts[k] ?? null;
  });
  const perPlanTexts: (string | null)[][] = plans.map(() => []);
  flat.forEach((f, i) => {
    perPlanTexts[f.planIdx]?.push(flatTexts[i] ?? null);
  });
  return perPlanTexts;
}

/** The per-bucket commit tally accumulated across PHASE 3 (tier-0 store) + PHASE 4 (consolidation), emitted as
 *  the bucket's `memory.build` trace at the end — observability parity with the live path's per-turn trace.
 *  Shape mirrors the digest build's tier-0 counts so it feeds `logBuild` directly. */
interface PlanCommit {
  written: number;
  skipped: number;
  skippedTokenGuard: number;
  skippedEmpty: number;
}

/** The mutable commit state threaded through PHASE 3 + PHASE 4 (bundled to keep the helpers at ≤4 params). */
interface CommitState {
  readonly plans: readonly DigestPlan[];
  readonly perPlan: PlanCommit[];
  readonly signal: AbortSignal;
}

/** One bucket's collected tier-k consolidation work, derived by inference (no-inline-types). */
type ConsTierPlan = NonNullable<Awaited<ReturnType<typeof collectConsolidationTier>>>;

/** A collected bucket at one tier, tagged with its plan index + scope for the store scatter. */
interface CollectedTier {
  readonly planIdx: number;
  readonly scope: MemoryScope;
  readonly cons: ConsTierPlan;
}

/** PHASE 3 — store every bucket's tier-0 blocks (embed-store of the PHASE-2 summaries; NO LLM). Per-bucket
 *  isolation: a poisoned store is counted + logged, the rest still land. Seeds each bucket's commit tally with
 *  the plan-time skip counts (tier-0 settled + token-guard). Returns the failure count. */
async function storeAllTier0(ctx: ChatContext, state: CommitState, perPlanTexts: readonly (string | null)[][]): Promise<number> {
  let failed = 0;
  for (let pi = 0; pi < state.plans.length; pi += 1) {
    if (state.signal.aborted) {
      break;
    }
    const plan = state.plans[pi];
    const texts = perPlanTexts[pi];
    const acc = state.perPlan[pi];
    if (plan === undefined || texts === undefined || acc === undefined) {
      continue;
    }
    acc.skipped += plan.skipped;
    acc.skippedTokenGuard += plan.skippedTokenGuard;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: sequential embed-store — the tier-0 writes must not race the db.
      const stored = await storeTier0(ctx, plan, texts);
      acc.written += stored.written;
      acc.skippedEmpty += stored.skippedEmpty;
    } catch (err) {
      failed += 1;
      getLog().error(
        { err, chatId: plan.scope.chatId, scopedCharacterId: plan.scope.scopedCharacterId },
        "memory backfill: bucket FAILED during tier-0 store (unexpected error)",
      );
    }
  }
  return failed;
}

/** COLLECT tier k across every bucket that reaches it (reads tier-k rows; NO LLM). Folds each bucket's
 *  hash-skip tally into `perPlan` and returns only the buckets with pending parents to summarize. */
async function collectTierAcrossBuckets(ctx: ChatContext, state: CommitState, tier: number): Promise<{ collected: CollectedTier[]; failed: number }> {
  const collected: CollectedTier[] = [];
  let failed = 0;
  for (let pi = 0; pi < state.plans.length; pi += 1) {
    if (state.signal.aborted) {
      break;
    }
    const plan = state.plans[pi];
    const acc = state.perPlan[pi];
    if (plan === undefined || acc === undefined || tier >= plan.cfg.maxTier) {
      continue;
    }
    try {
      // biome-ignore lint/performance/noAwaitInLoops: per-bucket tier-k reads precede this tier's writes; parallel would race the db.
      const cons = await collectConsolidationTier(ctx, plan.scope, plan.cfg, { tier, existing: plan.existing, signal: state.signal });
      if (cons === null) {
        continue; // this bucket's consolidation ceiling
      }
      acc.skipped += cons.skipped;
      if (cons.pending.length > 0) {
        collected.push({ planIdx: pi, scope: plan.scope, cons });
      }
    } catch (err) {
      failed += 1;
      getLog().error(
        { err, chatId: plan.scope.chatId, scopedCharacterId: plan.scope.scopedCharacterId, tier },
        "memory backfill: bucket FAILED during consolidation collect (unexpected error)",
      );
    }
  }
  return { collected, failed };
}

/** SUMMARIZE every collected bucket's tier-k parents in ONE length-sorted batch, then STORE each bucket's
 *  tier-(k+1) parents (sequential embed-store). Returns the failure count; write/skip tallies fold into perPlan. */
async function summarizeAndStoreTier(ctx: ChatContext, collected: readonly CollectedTier[], state: CommitState): Promise<number> {
  const flat: { readonly ci: number; readonly input: SummarizeInput }[] = [];
  collected.forEach((c, ci) => {
    for (const p of c.cons.pending) {
      flat.push({ ci, input: p.input });
    }
  });
  const order = flat.map((_, i) => i).sort((a, b) => inputLen(flat[a]?.input) - inputLen(flat[b]?.input));
  const sortedTexts = await summarizeConsolidationBatch(ctx, orderedInputs(flat, order));
  const flatTexts: (string | null)[] = new Array(flat.length).fill(null);
  order.forEach((origIdx, k) => {
    flatTexts[origIdx] = sortedTexts[k] ?? null;
  });
  const perCollected: (string | null)[][] = collected.map(() => []);
  flat.forEach((f, i) => {
    perCollected[f.ci]?.push(flatTexts[i] ?? null);
  });
  let failed = 0;
  for (let ci = 0; ci < collected.length; ci += 1) {
    if (state.signal.aborted) {
      break;
    }
    const c = collected[ci];
    const texts = perCollected[ci];
    const acc = c === undefined ? undefined : state.perPlan[c.planIdx];
    if (c === undefined || texts === undefined || acc === undefined) {
      continue;
    }
    try {
      // biome-ignore lint/performance/noAwaitInLoops: sequential embed-store — the consolidation writes must not race the db.
      const stored = await storeConsolidationTier(ctx, c.scope, c.cons, texts);
      acc.written += stored.written;
      acc.skippedEmpty += stored.skippedEmpty;
    } catch (err) {
      failed += 1;
      getLog().error(
        { err, chatId: c.scope.chatId, scopedCharacterId: c.scope.scopedCharacterId, tier: c.cons.parentTier },
        "memory backfill: bucket FAILED during consolidation store (unexpected error)",
      );
    }
  }
  return failed;
}

/** One corpus tier: collect across all buckets, then (if any pending) summarize corpus-wide + store. Folded to
 *  ONE await per tier in the caller so the read-your-writes tier barrier stays a single sequential step. */
async function consolidateCorpusTier(ctx: ChatContext, state: CommitState, tier: number): Promise<number> {
  const { collected, failed } = await collectTierAcrossBuckets(ctx, state, tier);
  if (collected.length === 0) {
    return failed; // nothing complete at this tier anywhere
  }
  return failed + (await summarizeAndStoreTier(ctx, collected, state));
}

/** PHASE 4 — consolidate the whole corpus tier by tier (up to the max `maxTier` across buckets). For each tier
 *  k: COLLECT every bucket's complete/stale parent groups, SUMMARIZE them all in ONE length-sorted batch, then
 *  STORE each bucket's tier-(k+1) parents. Tier k FULLY stores before tier k+1 collects — the read-your-writes
 *  dependency the live per-bucket walk gets for free (tier k+1 consolidates the rows tier k just wrote). The
 *  summarize batches corpus-wide (no db, saturates vLLM); the stores stay per-bucket sequential (db). */
async function consolidateAllTiers(ctx: ChatContext, state: CommitState): Promise<number> {
  const maxTier = state.plans.reduce((m, p) => Math.max(m, p.cfg.maxTier), 0);
  let failed = 0;
  for (let tier = 0; tier < maxTier; tier += 1) {
    if (state.signal.aborted) {
      break;
    }
    // biome-ignore lint/performance/noAwaitInLoops: tier k+1 reads tier k's rows — the corpus walk is sequential BY TIER (buckets within a tier are the batch).
    failed += await consolidateCorpusTier(ctx, state, tier);
  }
  return failed;
}

/** PHASES 3 + 4 — store every bucket's tier-0 (PHASE 3), consolidate the whole corpus tier-by-tier (PHASE 4),
 *  then emit each bucket's `memory.build` trace. The per-bucket isolation of the old commit loop is preserved:
 *  a poisoned store/collect is counted + logged, the rest still build (the content-hash self-heal retries next
 *  pass). Returns the corpus digest-change + failure tallies. */
async function commitAllPlans(
  ctx: ChatContext,
  plans: readonly DigestPlan[],
  perPlanTexts: readonly (string | null)[][],
  signal: AbortSignal,
): Promise<{ changed: number; failed: number }> {
  const state: CommitState = { plans, perPlan: plans.map(() => ({ written: 0, skipped: 0, skippedTokenGuard: 0, skippedEmpty: 0 })), signal };
  let failed = await storeAllTier0(ctx, state, perPlanTexts);
  failed += await consolidateAllTiers(ctx, state);
  let changed = 0;
  for (let pi = 0; pi < plans.length; pi += 1) {
    const plan = plans[pi];
    const acc = state.perPlan[pi];
    if (plan === undefined || acc === undefined) {
      continue;
    }
    logBuild(ctx, plan.scope, { startedAt: plan.startedAt, counts: acc });
    changed += acc.written;
  }
  return { changed, failed };
}

/**
 * The corpus-wide memory backfill, restructured into THREE global phases so vLLM sees ONE big batch instead of
 * a tiny one per bucket (measured ~6.6× on the sweep — a single saturated continuous batch, and no per-bucket
 * gen-idle window while embeds run). Every write is the same idempotent/self-healing path the live per-turn
 * trigger uses; the sweep only REORDERS the work: PLAN all buckets → SUMMARIZE the whole corpus at once →
 * COMMIT each. Note: PLAN holds every bucket's fitted transcript inputs in memory across the sweep — a
 * deliberate throughput-for-memory trade sized to the corpus; a very large corpus would want a chunked loop.
 */
export async function backfillMemory(
  ctx: ChatContext,
  args: { readonly signal: AbortSignal; readonly ownerId?: UserId | null },
  resolveMemoryConfig: ResolveBackfillMemoryConfig,
): Promise<MemoryBackfillCounts> {
  const sweep = await planAllBuckets(ctx, args, resolveMemoryConfig);
  const perPlanTexts = await summarizeAllPending(ctx, sweep.plans);
  const committed = await commitAllPlans(ctx, sweep.plans, perPlanTexts, args.signal);
  return {
    segments: { scanned: sweep.segmentsScanned, changed: sweep.segmentsChanged },
    digests: { scanned: sweep.digestsScanned, changed: committed.changed },
    failed: sweep.failed + committed.failed,
  };
}

/** Sort key for the corpus-wide summarize batch: total prompt length (system + user). Similar-length inputs
 *  pack into vLLM's continuous batches with less padding waste. */
function inputLen(input: SummarizeInput | undefined): number {
  return input === undefined ? 0 : input.systemPrompt.length + input.userPrompt.length;
}

/**
 * The group-character backfill: every \>1-character room gets its synthetic group character if it lacks
 * one. Idempotent — an existing mint is a scanned-not-changed pass. `scanned` = group rooms visited;
 * `changed` = characters minted this run.
 */
export async function backfillGroupCharacters(
  ctx: ChatContext,
  args: { readonly signal: AbortSignal; readonly ownerId?: UserId | null },
): Promise<BackfillPassCounts> {
  const counts = { scanned: 0, changed: 0 };
  for (const chatId of await loadAllChatIds(ctx, args.ownerId)) {
    if (args.signal.aborted) {
      break;
    }
    // biome-ignore lint/performance/noAwaitInLoops: sequential by design — the mint writes must not race each other (idempotence is per-chat, checked-then-minted).
    const roster = await loadRoster(ctx.db, chatId);
    const cast = roster.filter((r) => r.kind === "character" && r.characterId !== null);
    const hostUserId = hostUserIdOf(roster);
    if (cast.length <= 1 || hostUserId === null) {
      continue; // solo/empty rooms need no group character; a hostless room has no funding owner
    }
    counts.scanned += 1;
    const existing = await ctx.findSyntheticGroupCharacter({ ownerId: hostUserId, chatId });
    if (existing !== null) {
      continue;
    }
    await ctx.mintSyntheticGroupCharacter({ ownerId: hostUserId, chatId });
    counts.changed += 1;
  }
  return counts;
}
