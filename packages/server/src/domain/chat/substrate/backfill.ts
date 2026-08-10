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
import { commitDigestPlan, planDigests, summarizeDigestBatch } from "../memory/build/digests.ts";
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

/** The digest plan handed from `planDigests` to `commitDigestPlan` — derived by inference so this build-internal
 *  orchestration type stays out of a substrate export (no-inline-types: exported types live in a type home). */
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

/** PHASE 3 — commit each plan (store its tier-0 blocks index-aligned to its texts, then consolidate upward).
 *  Per-bucket isolation: a poisoned bucket is counted + logged, the rest still build (self-heal retries next). */
async function commitAllPlans(
  ctx: ChatContext,
  plans: readonly DigestPlan[],
  perPlanTexts: readonly (string | null)[][],
  signal: AbortSignal,
): Promise<{ changed: number; failed: number }> {
  let changed = 0;
  let failed = 0;
  for (let pi = 0; pi < plans.length; pi += 1) {
    if (signal.aborted) {
      break;
    }
    const plan = plans[pi];
    const texts = perPlanTexts[pi];
    if (plan === undefined || texts === undefined) {
      continue;
    }
    try {
      // biome-ignore lint/performance/noAwaitInLoops: sequential commit — a bucket's embed-store + consolidation writes must not race the db.
      const c = await commitDigestPlan(ctx, plan, texts);
      changed += c.written;
    } catch (err) {
      failed += 1;
      getLog().error(
        { err, chatId: plan.scope.chatId, scopedCharacterId: plan.scope.scopedCharacterId },
        "memory backfill: bucket FAILED during commit and was skipped (unexpected error)",
      );
    }
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
