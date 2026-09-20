// domain/chat/substrate/backfill — the corpus-wide maintenance sweeps the workloads engine drives. Two
// sweeps, both @public composition-root helpers, homed in `substrate/` because they coordinate the
// `memory/` subsystem + `persistence/` reads.
//
//   - `backfillMemory` — enumerate every chat, collect the segment build, then the digest build per scope
//     bucket, mirroring the engine's post-turn enumeration but re-ordered into corpus-wide PHASES (the DAG is
//     stated on `backfillMemory` itself). Per-chat builds are already idempotent/self-healing, so the sweep
//     is resumable. A `mode:"off"` host's chat is skipped entirely.
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

import { buildIdentityNameContext } from "@orb/contracts/chat";
import type { SummarizeInput } from "@orb/contracts/role-clients";
import { chatParticipants, chats } from "@orb/db";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import type { RowMacroNameContext } from "@orb/kit/macro";
import { and, eq, isNull } from "drizzle-orm";
import { getLog } from "#foundation/observability";
import type { ChatContext } from "../context.ts";
import type { BackfillPassCounts, MemoryBackfillSweepCounts, MemoryScope, ResolveBackfillMemoryConfig } from "../contract/memory.ts";
import {
  collectConsolidationTier,
  logBuild,
  planDigests,
  storeConsolidationTier,
  storeTier0,
  summarizeConsolidationBatch,
  summarizeDigestBatch,
} from "../memory/build/digests.ts";
import { collectSegments, storeSegments } from "../memory/build/segments.ts";
import { loadWitnessHorizons } from "../memory/persistence/queries.ts";
import { loadChatIdentityProducer } from "../persistence/identity.ts";
import { classifyParticipant } from "../persistence/participant.ts";
import { loadParticipants } from "../persistence/participants-read.ts";
import { resolveGroupBucketCharacterId } from "./group-bucket.ts";
import { hostUserIdOf } from "./participants-host.ts";

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

/** A chat's present characters + its host + the projected macro-name context (the summarizer transcript labels
 *  resolve by character/persona name, not the raw id). One roster read serves all three. */
async function loadCharacterIdsAndHost(
  ctx: ChatContext,
  chatId: ChatId,
): Promise<{
  characterIds: CharacterId[];
  hostUserId: UserId | null;
  macroNames: RowMacroNameContext;
}> {
  const participants = await loadParticipants(ctx.db, chatId);
  const characterIds = participants.flatMap((r) => {
    const actor = classifyParticipant(r);
    return actor?.kind === "character" ? [actor.characterId] : [];
  });
  const hostUserId = hostUserIdOf(participants);
  const macroNames: RowMacroNameContext = buildIdentityNameContext(await loadChatIdentityProducer(ctx.db, { participants }));
  return { characterIds, hostUserId, macroNames };
}

/** The digest scope buckets for one chat — mirrors the engine's post-turn enumeration: the shared group
 *  bucket gated on the character count (no-op for solo), then every seated character's bucket. A hostless group has
 *  no funding owner to mint under, so its shared bucket is skipped (per-character buckets still build). */
async function scopesFor(ctx: ChatContext, chatId: ChatId, characterIds: readonly CharacterId[], hostUserId: UserId | null): Promise<MemoryScope[]> {
  const scopes: MemoryScope[] = [];
  if (characterIds.length > 1 && hostUserId !== null) {
    const scopedCharacterId = await resolveGroupBucketCharacterId(ctx, {
      ownerId: hostUserId,
      chatId,
    });
    scopes.push({ chatId, scopedCharacterId, isGroup: characterIds.length > 1 });
  }
  for (const scopedCharacterId of characterIds) {
    scopes.push({ chatId, scopedCharacterId, isGroup: characterIds.length > 1 });
  }
  return scopes;
}

/** The digest plan `planDigests` produces (PHASE 1) and PHASE 3/4 consume (`storeTier0` + consolidation) —
 *  derived by inference so this build-internal orchestration type stays out of a substrate export
 *  (no-inline-types: exported types live in a type home). */
type DigestPlan = NonNullable<Awaited<ReturnType<typeof planDigests>>>;

/** One chat's collected segment work, derived by inference so this build-internal orchestration type stays
 *  out of a substrate export (the `DigestPlan` precedent above). */
type SegmentWork = Awaited<ReturnType<typeof collectSegments>>;

/** The PHASE-1 fold: the collected plans + the collected SEGMENT chunk writes + the running scan counts +
 *  failure tally. Segment chunks accumulate corpus-wide instead of being embedded per chat (#172): PHASE 1b
 *  submits them as ONE flood. */
interface PlanSweep {
  readonly plans: DigestPlan[];
  readonly segments: SegmentWork[];
  segmentsScanned: number;
  digestsScanned: number;
  failed: number;
  readonly spaces: Map<UserId, string>;
}

/** The per-chat plan dependencies (bundled to keep `planOneChat` at ≤4 params). */
interface PlanDeps {
  readonly signal: AbortSignal;
  readonly resolveMemoryConfig: ResolveBackfillMemoryConfig;
  /** The WORKLOAD's principal — whose summarize/embed connections the whole sweep spends (§8.5b; the
   *  corpus batch is flat across chats, so one funder per sweep, never per room). */
  readonly funderUserId: UserId;
}

function recordSpace(sweep: PlanSweep, space: { readonly ownerId: UserId; readonly model: string }): void {
  const priorSpace = sweep.spaces.get(space.ownerId);
  if (priorSpace !== undefined && priorSpace !== space.model) {
    throw new Error(`memory embed space changed during planning for owner ${space.ownerId}`);
  }
  sweep.spaces.set(space.ownerId, space.model);
}

/** Plan ONE chat: COLLECT its segment chunks (no embed), then tier-0 COLLECT each of its scope buckets into
 *  `sweep`. No summarize, no vector write — both are corpus-wide phases of their own. */
async function planOneChat(ctx: ChatContext, deps: PlanDeps, chatId: ChatId, sweep: PlanSweep): Promise<void> {
  const { characterIds, hostUserId, macroNames } = await loadCharacterIdsAndHost(ctx, chatId);
  // Resolved inside the per-chat try (the caller's) so a settings-read failure is counted + continues.
  const config = hostUserId === null ? null : await deps.resolveMemoryConfig(hostUserId);
  if (config?.mode === "off") {
    return; // the host disabled memory — skip enumerate/mint/plan entirely.
  }
  if (hostUserId === null) {
    // Preserve enumeration accounting for a stale hostless room, but do not spend the workload principal's
    // unrelated embed binding on rows that have no owner-space to land in.
    sweep.segmentsScanned += 1;
    sweep.digestsScanned += characterIds.length;
    return;
  }
  // COLLECT only — the chunking, the hash gate and the shrink prune happen here; the embeds do not. Every
  // chat's pending chunks pool into one corpus-wide flood (PHASE 1b), which is what the owner batching ruling
  // asks for: batch by phase, never one awaited embed per block interleaved with db reads.
  const segments = await collectSegments(ctx, {
    chatId,
    funderUserId: deps.funderUserId,
    embedOwnerId: hostUserId,
    config,
    macroNames,
    signal: deps.signal,
  });
  sweep.segments.push(segments);
  if (segments.embedSpace !== null) {
    recordSpace(sweep, segments.embedSpace);
  }
  sweep.segmentsScanned += 1;
  const characterIdSet = new Set<CharacterId>(characterIds);
  for (const scope of await scopesFor(ctx, chatId, characterIds, hostUserId)) {
    if (deps.signal.aborted) {
      break;
    }
    const witnessing = characterIdSet.has(scope.scopedCharacterId) ? await loadWitnessHorizons(ctx.db, chatId, scope.scopedCharacterId) : undefined;
    const plan = await planDigests(ctx, {
      scope,
      funderUserId: deps.funderUserId,
      config,
      macroNames,
      signal: deps.signal,
      ...(witnessing !== undefined ? { witnessing } : {}),
      embedOwnerId: hostUserId,
    });
    sweep.digestsScanned += 1; // each (chat × scope) bucket is one scanned unit, planned or a no-op
    if (plan !== null) {
      recordSpace(sweep, plan.embedSpace);
      sweep.plans.push(plan);
    }
  }
}

/** PHASE 1 — plan every (chat × scope) bucket corpus-wide (segments + tier-0 collect; NO summarize). One
 *  poisoned chat is counted + logged, never kills the sweep (#41 — every EXPECTED branch returns without
 *  throwing, so a throw landing in the catch is a genuine unexpected fault). */
async function planAllBuckets(
  ctx: ChatContext,
  args: { readonly signal: AbortSignal; readonly ownerId?: UserId | null; readonly funderUserId: UserId },
  resolveMemoryConfig: ResolveBackfillMemoryConfig,
): Promise<PlanSweep> {
  const sweep: PlanSweep = { plans: [], segments: [], segmentsScanned: 0, digestsScanned: 0, failed: 0, spaces: new Map() };
  const deps: PlanDeps = { signal: args.signal, resolveMemoryConfig, funderUserId: args.funderUserId };
  for (const chatId of await loadAllChatIds(ctx, args.ownerId)) {
    if (args.signal.aborted) {
      break; // cooperative abort between chats — every completed unit is durable + idempotent
    }
    try {
      await planOneChat(ctx, deps, chatId, sweep);
    } catch (err) {
      sweep.failed += 1;
      // The CAUSE rides as scalar fields, not only inside the serialized `err` (#165): the dev stack's
      // pretty stream renders the message line and the object separately, and two whole 895-chat runs were
      // read as "no exception logged" because the stack block below the line was never scrolled to. `err`
      // still rides for the stack; these three are what a one-line read needs. Metadata only — an error
      // MESSAGE from a provider/db is a shape, never RP content (the logs-are-metadata doctrine holds).
      getLog().error(
        { err, chatId, phase: "plan", errName: err instanceof Error ? err.name : typeof err, errMessage: err instanceof Error ? err.message : String(err) },
        "memory backfill: chat FAILED during plan and was skipped (unexpected error)",
      );
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
async function summarizeAllPending(ctx: ChatContext, funderUserId: UserId, plans: readonly DigestPlan[]): Promise<(string | null)[][]> {
  const flat: { readonly planIdx: number; readonly input: SummarizeInput }[] = [];
  for (let pi = 0; pi < plans.length; pi += 1) {
    for (const item of plans[pi]?.pending ?? []) {
      flat.push({ planIdx: pi, input: item.input });
    }
  }
  const order = flat.map((_, i) => i).sort((a, b) => inputLen(flat[a]?.input) - inputLen(flat[b]?.input));
  const sortedTexts = await summarizeDigestBatch(ctx, funderUserId, orderedInputs(flat, order));
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
  readonly funderUserId: UserId;
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
      const cons = await collectConsolidationTier(ctx, plan.scope, plan.cfg, {
        tier,
        existing: plan.existing,
        signal: state.signal,
        funderUserId: state.funderUserId,
        embedSpace: plan.embedSpace,
      });
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
  const sortedTexts = await summarizeConsolidationBatch(ctx, state.funderUserId, orderedInputs(flat, order));
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
  run: { readonly signal: AbortSignal; readonly funderUserId: UserId },
): Promise<{ changed: number; failed: number }> {
  const state: CommitState = {
    plans,
    perPlan: plans.map(() => ({ written: 0, skipped: 0, skippedTokenGuard: 0, skippedEmpty: 0 })),
    signal: run.signal,
    funderUserId: run.funderUserId,
  };
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
 * The corpus-wide memory backfill, restructured into GLOBAL PHASES so vLLM sees ONE big batch per phase
 * instead of a tiny one per bucket (measured ~6.6× on the sweep — a single saturated continuous batch, and no
 * per-bucket gen-idle window while embeds run). Every write is the same idempotent/self-healing path the live
 * per-turn trigger uses; the sweep only REORDERS the work.
 *
 * THE PHASE DAG (each phase completes corpus-wide before the next starts; a phase's engine work is ONE
 * submission, never a per-item round-robin — owner batching ruling, #172):
 *
 *   PHASE 1  PLAN      per chat: collect its SEGMENT chunks (chunk + hash-gate + shrink-prune, no embed),
 *                      then tier-0 COLLECT each of its digest scope buckets (no summarize).
 *   PHASE 1b SEGMENTS  ONE length-sorted embed flood over every chat's pending chunks → rows. Independent of
 *                      the digest phases (a segment is verbatim canon; a digest is a summary of it), so it
 *                      runs first and its engine time is over before the summarizer starts.
 *   PHASE 2  SUMMARIZE the whole corpus's tier-0 blocks in ONE length-sorted batch.
 *   PHASE 3  STORE     each bucket's tier-0 digests (embed-store; per-bucket sequential — db writes).
 *   PHASE 4  CONSOLIDATE tier by tier: COLLECT every bucket at tier k → ONE summarize batch → STORE tier k+1.
 *                      Tier k fully stores before tier k+1 collects (the read-your-writes barrier).
 *
 * Note: PLAN holds every bucket's fitted transcript inputs AND every changed block's verbatim chunk text in
 * memory across the sweep — a deliberate throughput-for-memory trade sized to the corpus; a very large corpus
 * would want a chunked loop.
 */
export async function backfillMemory(
  ctx: ChatContext,
  args: { readonly signal: AbortSignal; readonly ownerId?: UserId | null; readonly funderUserId: UserId },
  resolveMemoryConfig: ResolveBackfillMemoryConfig,
): Promise<MemoryBackfillSweepCounts> {
  const sweep = await planAllBuckets(ctx, args, resolveMemoryConfig);
  const segments = await storeAllSegments(ctx, sweep.segments);
  const perPlanTexts = await summarizeAllPending(ctx, args.funderUserId, sweep.plans);
  const committed = await commitAllPlans(ctx, sweep.plans, perPlanTexts, { signal: args.signal, funderUserId: args.funderUserId });
  const failed = sweep.failed + segments.failed + committed.failed;
  return {
    segments: { scanned: sweep.segmentsScanned, changed: segments.written },
    segmentsSkippedOverWindow: segments.skippedOverWindow,
    digests: { scanned: sweep.digestsScanned, changed: committed.changed },
    failed,
    completedSpaces: failed === 0 && !args.signal.aborted ? [...sweep.spaces].map(([ownerId, model]) => ({ ownerId, model })) : [],
  };
}

/** PHASE 1b — the SEGMENT flood (#172, owner batching ruling). Every chat's pending chunks, collected during
 *  PHASE 1, go to the embeddings batch op in ONE call: one saturated continuous batch on the engine instead
 *  of a per-chat ramp, and zero client-side throttling (the provider surface owns how it lands on the wire).
 *  The pending texts are length-sorted first, exactly like the corpus summarize batch below — similar-length
 *  sequences pack with less ragged-batch padding.
 *
 *  MEMORY TRADE, stated: this holds every CHANGED block's verbatim text in RAM for the length of the sweep —
 *  the same deliberate throughput-for-memory bargain PHASE 1 already makes for the digest inputs, and bounded
 *  by the same thing (a steady-state sweep changes almost nothing; a first full backfill holds the corpus's
 *  aged-out text, which the db is about to store anyway). */
async function storeAllSegments(ctx: ChatContext, collected: readonly SegmentWork[]): Promise<{ written: number; skippedOverWindow: number; failed: number }> {
  const pending = collected.flatMap((c) => c.pending).sort((a, b) => a.text.length - b.text.length);
  const skippedOverWindow = collected.reduce((n, c) => n + c.skippedOverWindow, 0);
  try {
    const stored = await storeSegments(ctx, {
      embedSpace: null,
      pending,
      skipped: collected.reduce((n, c) => n + c.skipped, 0),
      skippedOverWindow,
    });
    return { written: stored.written, skippedOverWindow: stored.skippedOverWindow, failed: 0 };
  } catch (err) {
    // ISOLATED like every other phase (#41): one poisoned chunk (a filtered vector, a dead engine) must not
    // also cost the corpus its DIGEST half, which needs no embed of these blocks at all. Counted + logged
    // with the cause as scalars (#165), and the content-hash self-heal re-offers every unwritten chunk next
    // pass — a batch failure loses throughput, never content.
    getLog().error(
      {
        err,
        phase: "segments",
        pending: pending.length,
        errName: err instanceof Error ? err.name : typeof err,
        errMessage: err instanceof Error ? err.message : String(err),
      },
      "memory backfill: the SEGMENT embed flood FAILED — no segment rows were written this pass (digests still build; the self-heal re-offers every chunk)",
    );
    return { written: 0, skippedOverWindow, failed: 1 };
  }
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
  args: { readonly signal: AbortSignal; readonly ownerId?: UserId | null; readonly funderUserId: UserId },
): Promise<BackfillPassCounts> {
  const counts = { scanned: 0, changed: 0 };
  for (const chatId of await loadAllChatIds(ctx, args.ownerId)) {
    if (args.signal.aborted) {
      break;
    }
    const participants = await loadParticipants(ctx.db, chatId);
    const characterIds = participants.filter((r) => classifyParticipant(r)?.kind === "character");
    const hostUserId = hostUserIdOf(participants);
    if (characterIds.length <= 1 || hostUserId === null) {
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
