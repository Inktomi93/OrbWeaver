// domain/chat/memory/generate/digests — the digest builder. Block-summarize each complete, aged-out `blockSize`
// block via ctx.summarize, parse the three-part unit, write the digest through ctx.embeddingsStore (the one
// vector-write path — memory holds no cosine, no direct INSERT), then consolidate upward (fanOut tier-k
// digests → one tier-(k+1) digest, the bounded "story so far").
//
// SELF-HEAL: a block is (re)digested only if missing or its content_hash changed — the protected tip
// (maxSeq − verbatimWindow) never digests, so a swipe/edit at the live tip never touches a settled digest.
//
// THREE WAYS A STORED DIGEST GOES WRONG, THREE MECHANISMS (#1395): content CHANGED → the hash self-heal
// re-summarizes it; the block DISAPPEARED → `embeddingsPruneBlocks` reclaims it (the shrink, `queries.ts`);
// the replacement FAILED → this file INVALIDATES the row it could not replace. The third used to have no
// mechanism, so a proven-stale digest (its hash mismatch is what queued the rebuild) stayed live in recall
// for as long as the summarizer kept returning nothing — see `storeTier0`/`storeConsolidationTier`.

import type { SummarizeInput, SummarizeOptions } from "@orb/contracts/role-clients";
import { DEFAULT_MEMORY_SUMMARIZER_MAX_TOKENS, DEFAULT_MEMORY_SUMMARIZER_PRESENCE_PENALTY } from "@orb/contracts/settings";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { RowMacroNameContext } from "@orb/kit/macro";
import { estimateTokens } from "@orb/kit/tokens";
import { getLog } from "#foundation/observability";
import type { ChatContext } from "../../context.ts";
import { resolveCfg } from "../constants.ts";
import { loadCanonThroughSeq, loadChatMeta, loadDigestHashes, loadDigestSpeakers, loadDigestsForScope } from "../persistence/queries.ts";
import type { BlockSpan, DigestRow, MemoryConfig, MemoryEmbedSpace, MemoryPassCounts, MemoryScope, WitnessInterval } from "../types.ts";
import { parseDigest } from "./substrate/parse.ts";
import { consolidationSystemPrompt, consolidationUserPrompt, digestSystemPrompt, digestUserPrompt } from "./substrate/prompts.ts";
import { DEFAULT_OUTPUT_RESERVE_TOKENS, fitBlockToBudget, fitConsolidationChildren, SUMMARIZER_CONTEXT_FLOOR } from "./substrate/token-guard.ts";
import { blockHash, blockSpeakerIds, consolidationHash, EMPTY_MACRO_NAMES, renderTranscript, sliceBlocks } from "./substrate/transcript.ts";
import { spanWitnessed } from "./substrate/witnessing.ts";

/** `witnessing`, when present, is the scoped-build gate: only blocks the scope character was present for (its
 *  join/leave horizons) are digested into its bucket. Absent ⇒ the shared (merged/narrator) build. */
interface GenerateDigestsArgs {
  readonly scope: MemoryScope;
  /** WHOSE summarize connection the build spends (§8.5b): the turn's trigger on the live path, the workload's
   *  principal on the corpus backfill. */
  readonly funderUserId: UserId;
  readonly config?: MemoryConfig | null | undefined;
  readonly macroNames?: RowMacroNameContext | undefined;
  readonly witnessing?: readonly WitnessInterval[] | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly embedSpace?: MemoryEmbedSpace | undefined;
  readonly embedOwnerId?: UserId | undefined;
}

/** The admin-resolved summarize call options (`AppSettings.memorySummarizer`) — passed onto every `summarize`
 *  call. The summarizer keeps its OWN sampler knobs (NOT coupled to chat presets):
 *  each admin-set knob rides; an unset knob falls to the engine default, EXCEPT `maxTokens` and
 *  `presencePenalty`, which ALWAYS ride at their memory-build defaults when unset. Both are the same loop fix:
 *  the summarize wire does NOT inherit the vLLM chat surface's per-request presence default, so a
 *  repetition_penalty=1.0 model with no presence penalty AND no max_tokens ceiling loops UNBOUNDED to the
 *  120s request timeout. `presencePenalty` discourages the loop; `maxTokens` hard-caps it (and is the SAME
 *  value `outputReserve` fits the input against — one home, see there). A deliberate admin override (incl 0) wins. */
function summarizerOpts(ctx: ChatContext): SummarizeOptions {
  const s = ctx.memorySummarizer;
  return {
    maxOutputTokens: s.maxTokens ?? DEFAULT_MEMORY_SUMMARIZER_MAX_TOKENS,
    ...(s.temperature !== undefined ? { temperature: s.temperature } : {}),
    ...(s.topP !== undefined ? { topP: s.topP } : {}),
    ...(s.topK !== undefined ? { topK: s.topK } : {}),
    ...(s.frequencyPenalty !== undefined ? { frequencyPenalty: s.frequencyPenalty } : {}),
    presencePenalty: s.presencePenalty ?? DEFAULT_MEMORY_SUMMARIZER_PRESENCE_PENALTY,
    ...(s.repetitionPenalty !== undefined ? { repetitionPenalty: s.repetitionPenalty } : {}),
    ...(s.minP !== undefined ? { minP: s.minP } : {}),
  };
}

/**
 * Summarize a batch through the ONE batched `ctx.summarize` call so the surface's bounded worker pool feeds
 * vLLM's continuous batcher — the throughput fix (a per-block single ran ONE worker, no continuous batching).
 * Returns each input's text index-aligned; `null` marks a hard per-item failure (and empty text is returned
 * verbatim for the caller's own empty-skip guard).
 *
 * The vLLM summarize surface is DELIBERATELY all-or-nothing (a per-item throw rejects the whole batch — a
 * contract chat-turn callers depend on and a pinned test asserts). So a batch rejection here falls back to
 * ISOLATED per-item calls: a POISON item then loses only itself and the rest still build (the content-hash
 * self-heal retries the dropped item next pass). The fallback runs only on failure, so the happy path stays a
 * single batched call.
 */
async function summarizeBatchIsolated(
  ctx: ChatContext,
  call: { readonly funderUserId: UserId; readonly opts: SummarizeOptions },
  inputs: readonly SummarizeInput[],
  onItemError: (index: number, err: unknown) => void,
): Promise<(string | null)[]> {
  if (inputs.length === 0) {
    return [];
  }
  // @orb-waive caught-failure-ownership(catch): a batch rejection falls back to ISOLATED
  // per-item calls (documented above) — the per-item loop below owns and reports each item's own failure
  // via `onItemError`; this outer catch only routes to that fallback, it never drops a failure silently.
  try {
    const res = await ctx.summarize(call.funderUserId, [...inputs], call.opts);
    return inputs.map((_, i) => res.items.at(i)?.text ?? null);
  } catch {
    const out: (string | null)[] = [];
    for (let i = 0; i < inputs.length; i += 1) {
      const input = inputs[i];
      if (input === undefined) {
        out.push(null);
        continue;
      }
      // @orb-waive caught-failure-ownership(err): reported via `onItemError(i, err)` (the
      // caller's own callback — content-hash self-heal retries the dropped item next pass) and returned as
      // a consumed `null` result, per the batch/isolate contract documented above.
      try {
        const res = await ctx.summarize(call.funderUserId, [input], call.opts);
        out.push(res.items.at(0)?.text ?? null);
      } catch (err) {
        onItemError(i, err);
        out.push(null);
      }
    }
    return out;
  }
}

/** The token-guard output reserve — the SAME `max_tokens` the summarize request sends (the one-home rule so
 *  the fit and the request can't diverge); unset ⇒ the baseline reserve. */
function outputReserve(ctx: ChatContext): number {
  return ctx.memorySummarizer.maxTokens ?? DEFAULT_OUTPUT_RESERVE_TOKENS;
}

/** The mutable tier-0 pass accumulator (the observability counts the build trace reports). */
interface Tier0Counts {
  written: number;
  skipped: number;
  skippedTokenGuard: number;
  skippedEmpty: number;
}

/** A consolidation pass's fold. `skippedEmpty` counts BOTH a blank summarizer result AND a bodyless arc (the
 *  #329 P1b output-shape guard) — a consolidation whose facts body is empty is skipped-and-retried, not stored. */
interface PassCounts {
  written: number;
  skipped: number;
  skippedEmpty: number;
}

const EMPTY_TIER0_COUNTS: Tier0Counts = { written: 0, skipped: 0, skippedTokenGuard: 0, skippedEmpty: 0 };

function assertStoreSpace(expected: MemoryEmbedSpace, actual: MemoryEmbedSpace): void {
  // @orb-waive membership-enforcer(ownerId): receipt integrity, not chat authority — `expected.ownerId` is the embedding-generation principal (the room's roster-resolved present host in production), while `actual.ownerId` is the store receipt; equality rejects a cross-principal result during the sweep. Ends when the store receipt type makes owner mismatch unrepresentable.
  if (
    actual.ownerId !== expected.ownerId ||
    actual.model !== expected.model ||
    actual.generationId !== expected.generationId ||
    actual.generationEpoch !== expected.generationEpoch
  ) {
    throw new Error(`memory digest embed space changed during sweep for owner ${expected.ownerId}`);
  }
}

/** One pending tier-0 block: everything the STORE needs, plus the summarize `input`. */
interface Tier0Pending {
  readonly block: BlockSpan;
  readonly hash: string;
  readonly input: SummarizeInput;
}

/** The prep + tier-0 COLLECT for ONE chat + scope bucket — everything up to (not including) the summarize.
 *  Backfill gathers a plan per bucket across the WHOLE corpus, runs ONE `summarizeDigestBatch` for every
 *  bucket's tier-0 blocks at once (length-sorted → vLLM's continuous batcher packs them), then stores them
 *  (`storeTier0`) and consolidates corpus-wide tier-by-tier (`collectConsolidationTier`/`storeConsolidationTier`)
 *  rather than committing a bucket at a time. `null` for the no-op cases (mode off, no aged-out block). */
interface DigestPlan {
  readonly embedSpace: MemoryEmbedSpace;
  readonly scope: MemoryScope;
  readonly funderUserId: UserId;
  readonly cfg: ReturnType<typeof resolveCfg>;
  readonly existing: ReadonlyMap<string, string>;
  readonly startedAt: number;
  readonly pending: readonly Tier0Pending[];
  readonly skipped: number;
  readonly skippedTokenGuard: number;
  readonly signal: AbortSignal | undefined;
}

export async function planDigests(ctx: ChatContext, args: GenerateDigestsArgs): Promise<DigestPlan | null> {
  const startedAt = ctx.now();
  const cfg = resolveCfg(args.config);
  const { chatId, scopedCharacterId } = args.scope;
  if (cfg.mode === "off") {
    logBuild(ctx, args.scope, { startedAt, counts: EMPTY_TIER0_COUNTS, note: "mode off" });
    return null;
  }
  const summarizerContextTokens = await ctx.summarizerContextTokens(args.funderUserId);
  if (summarizerContextTokens < SUMMARIZER_CONTEXT_FLOOR) {
    logBuild(ctx, args.scope, { startedAt, counts: EMPTY_TIER0_COUNTS, note: "summarizer context below floor" });
  }
  const macroNames = args.macroNames ?? EMPTY_MACRO_NAMES;

  const { maxSeq } = await loadChatMeta(ctx.db, chatId);
  const cutoff = maxSeq - cfg.verbatimWindow;
  if (cutoff < cfg.blockSize) {
    logBuild(ctx, args.scope, { startedAt, counts: EMPTY_TIER0_COUNTS, note: "no aged-out block" });
    return null;
  }
  const embedSpace = args.embedSpace ?? (await ctx.resolveMemoryEmbedSpace(args.embedOwnerId ?? args.funderUserId));

  const canon = await loadCanonThroughSeq(ctx.db, chatId, cutoff);
  const allBlocks = sliceBlocks(canon, cfg.blockSize);
  const blocks = args.witnessing === undefined ? allBlocks : allBlocks.filter((b) => spanWitnessed(b.seqStart, b.seqEnd, args.witnessing ?? []));
  // THE SHRINK RECLAIM, before anything reads the stored rows (see `blockCeilings`). It runs FIRST — not in
  // the store-then-prune order its `pruneDocumentChunks` sibling uses — because the consolidation pass below
  // reads the stored tier-k rows to build tier-(k+1): leaving an orphan in place for one more pass would fold
  // the vanished block's summary INTO a fresh parent, laundering it back into the pool through a row whose
  // hash is legitimately current. Nothing is re-stored by this call, so the build's no-op economy is intact.
  await ctx.embeddingsPruneBlocks({ lens: "digest", chatId, scopedCharacterId, keepPerTier: blockCeilings(allBlocks.length, cfg.fanOut, cfg.maxTier) });
  const existing = await loadDigestHashes(ctx.db, chatId, scopedCharacterId, embedSpace.generationId);

  const collected = await collectTier0(ctx, args, { blocks, existing, macroNames });
  return {
    embedSpace,
    scope: args.scope,
    funderUserId: args.funderUserId,
    cfg,
    existing,
    startedAt,
    pending: collected.pending,
    skipped: collected.skipped,
    skippedTokenGuard: collected.skippedTokenGuard,
    signal: args.signal,
  };
}

/** Commit a plan (the LIVE per-turn path): store the summarized tier-0 blocks (`texts` index-aligned to
 *  `plan.pending`), consolidate upward, and emit the build trace. The corpus backfill does NOT use this — it
 *  stores tier-0 (PHASE 3) and consolidates corpus-wide (PHASE 4) via the split `storeTier0` +
 *  `collectConsolidationTier`/`storeConsolidationTier` seams so it can batch each tier across every bucket. */
async function commitDigestPlan(ctx: ChatContext, plan: DigestPlan, texts: readonly (string | null)[]): Promise<MemoryPassCounts> {
  const stored = await storeTier0(ctx, plan, texts);
  const consolidated = await consolidateTiers(ctx, plan.scope, {
    cfg: plan.cfg,
    existing: plan.existing,
    signal: plan.signal,
    funderUserId: plan.funderUserId,
    embedSpace: plan.embedSpace,
  });
  const total: Tier0Counts = {
    written: stored.written + consolidated.written,
    skipped: plan.skipped + consolidated.skipped,
    skippedTokenGuard: plan.skippedTokenGuard,
    skippedEmpty: stored.skippedEmpty + consolidated.skippedEmpty,
  };
  logBuild(ctx, plan.scope, { startedAt: plan.startedAt, counts: total });
  return { written: total.written, skipped: total.skipped };
}

/** The ONE place both the live per-turn build and the corpus-wide backfill feed vLLM: a batched, per-item-
 *  isolated summarize of digest inputs with the admin summarizer opts. Index-aligned; `null` = per-item fail
 *  (the content-hash self-heal retries it next pass). Length-sort the inputs before this for the big backfill
 *  batch — similar-length sequences pack with less ragged-batch padding waste.
 *  NOT `async` (nor its consolidation twin): it only composes the opts + the error tag and FORWARDS
 *  `summarizeBatchIsolated`'s promise, so an added `await` would just re-wrap it. Every caller awaits. */
export function summarizeDigestBatch(ctx: ChatContext, funderUserId: UserId, inputs: readonly SummarizeInput[]): Promise<(string | null)[]> {
  return summarizeBatchIsolated(ctx, { funderUserId, opts: summarizerOpts(ctx) }, inputs, (i, err) =>
    getLog().error({ err, index: i }, "memory digest: block summarize FAILED (isolated — the block retries next pass)"),
  );
}

/** Generate (and self-heal) the digests for ONE chat + scope bucket — the LIVE per-turn path. Plan → one
 *  summarize of THIS bucket's blocks → commit. Never blocks a reply. `mode: 'off'` / no aged block → a no-op. */
export async function generateDigests(ctx: ChatContext, args: GenerateDigestsArgs): Promise<MemoryPassCounts> {
  const plan = await planDigests(ctx, args);
  if (plan === null) {
    return { written: 0, skipped: 0 };
  }
  const texts = await summarizeDigestBatch(
    ctx,
    plan.funderUserId,
    plan.pending.map((p) => p.input),
  );
  return commitDigestPlan(ctx, plan, texts);
}

/**
 * The surviving block COUNT per tier (index = tier), for the shrink reclaim — every stored row at
 * `blockIdx >= ceiling[tier]` indexes canon that no longer exists.
 *
 * Tier 0's ceiling is the block count itself, and it is deliberately `allBlocks.length` — the count BEFORE
 * the witnessing filter. Witnessing decides which blocks get WRITTEN into a scoped bucket, not which block
 * indices are legal, so a scoped bucket legitimately holds a sparse set (block 0 and block 2 with no block
 * 1); pruning against the filtered count would delete a perfectly valid high-index digest every pass.
 *
 * Each tier above divides by `fanOut` — the SAME `floor(childIdx / fanOut)` grouping the consolidation writer
 * uses, where a parent is written only over a COMPLETE group. That is what makes the upward CASCADE fall out
 * for free: shrink tier 0 and every ceiling above it drops, so the consolidation that folded a pruned block
 * is itself beyond its tier's ceiling and goes in the same DELETE. Length is `maxTier + 1` so the top
 * configured tier has a ceiling; a tier beyond that is outside this pass's authority and is left alone.
 */
function blockCeilings(blockCount: number, fanOut: number, maxTier: number): number[] {
  const ceilings: number[] = [blockCount];
  for (let tier = 1; tier <= maxTier; tier += 1) {
    ceilings.push(Math.floor((ceilings[tier - 1] ?? 0) / fanOut));
  }
  return ceilings;
}

/** The tier-0 COLLECT (PASS 1): walk the block grid, skip settled blocks (content-hash self-heal) and
 *  token-guard-doomed blocks, and COLLECT the rest as pending summarize inputs. NO LLM call, NO writes —
 *  so backfill can gather pending across every bucket before one corpus-wide summarize. */
async function collectTier0(
  ctx: ChatContext,
  args: GenerateDigestsArgs,
  env: {
    readonly blocks: readonly BlockSpan[];
    readonly existing: ReadonlyMap<string, string>;
    readonly macroNames: RowMacroNameContext;
  },
): Promise<{ pending: Tier0Pending[]; skipped: number; skippedTokenGuard: number }> {
  const { chatId, scopedCharacterId } = args.scope;
  let skipped = 0;
  let skippedTokenGuard = 0;
  // PROSE-1 census 78 — the digest instruction is the ROOM HOST's slot. Resolved ONCE per pass, and the
  // token guard fits against the RESOLVED text (a longer override must shrink the block, not overflow it).
  const systemPrompt = digestSystemPrompt(await ctx.resolveChatProse(chatId));
  const systemPromptTokens = estimateTokens(systemPrompt);
  const summarizerContextTokens = await ctx.summarizerContextTokens(args.funderUserId);
  const pending: Tier0Pending[] = [];
  for (const block of env.blocks) {
    args.signal?.throwIfAborted();
    const hash = blockHash(`${scopedCharacterId}:0:${block.blockIdx}`, block.rows);
    if (env.existing.get(`0:${block.blockIdx}`) === hash) {
      skipped += 1;
      continue;
    }
    const fitted = fitBlockToBudget(block.rows, env.macroNames, {
      contextTokens: summarizerContextTokens,
      systemPromptTokens,
      outputReserveTokens: outputReserve(ctx),
    });
    if (fitted === null) {
      skippedTokenGuard += 1;
      continue;
    }
    pending.push({ block, hash, input: { systemPrompt, userPrompt: digestUserPrompt(renderTranscript(fitted, env.macroNames)) } });
  }
  return { pending, skipped, skippedTokenGuard };
}

/** The tier-0 STORE (PASS 2): for each pending block, parse its summarized text and embed-store it. `texts` is
 *  index-aligned to `plan.pending`. The content-hash self-heal + empty-skip are preserved per block (a blank
 *  digest keyed by the block hash would skip forever, so it is left un-digested to retry next pass).
 *
 *  AND THE EMPTY SKIP INVALIDATES THE ROW IT LEAVES BEHIND (#1395). The skip's own reasoning is about the NEW
 *  digest — don't key a blank under this hash — and says nothing about the OLD one. But a pending block is
 *  pending precisely BECAUSE its stored hash mismatched: the build has already proven that row stale, and
 *  `loadDigestsForScope` has no currency filter, so leaving it live serves known-out-of-date memory on every
 *  recall until a later summarize happens to succeed. Retry does not make the intervening recalls safe. So
 *  the pre-existing row for every skipped key is DELETED — a block missing from recall is an honest degrade;
 *  a block whose summary predates an edit or a reattribution is not. Keys with no stored row (a first-time
 *  block that failed) are passed too and delete nothing — the DELETE is the same statement either way. */
export async function storeTier0(ctx: ChatContext, plan: DigestPlan, texts: readonly (string | null)[]): Promise<{ written: number; skippedEmpty: number }> {
  const { chatId, scopedCharacterId, isGroup } = plan.scope;
  let written = 0;
  let skippedEmpty = 0;
  const staleKeys: { tier: number; blockIdx: number; staleHash: string }[] = [];
  for (let i = 0; i < plan.pending.length; i += 1) {
    const item = plan.pending[i];
    if (item === undefined) {
      continue;
    }
    const raw = texts[i];
    if (raw === null || raw === undefined || raw.trim().length === 0) {
      skippedEmpty += 1;
      // Only a key with a STORED row is invalidated, and it carries that row's hash: a first-time block
      // that failed has nothing to invalidate, and the hash makes the delete a compare-and-swap so a
      // sibling pass that healed this block meanwhile keeps its fresh digest (#1543).
      const staleHash = plan.existing.get(`0:${item.block.blockIdx}`);
      if (staleHash !== undefined) {
        staleKeys.push({ tier: 0, blockIdx: item.block.blockIdx, staleHash });
      }
      continue;
    }
    const parsed = parseDigest(raw);
    const receipt = await ctx.embeddingsStore({
      lens: "digest",
      ownerId: plan.embedSpace.ownerId,
      model: plan.embedSpace.model,
      key: { chatId, tier: 0, blockIdx: item.block.blockIdx, scopedCharacterId },
      text: raw.trim(),
      contentHash: item.hash,
      topicAnchor: parsed.topicAnchor,
      keywords: parsed.keywords,
      isGroup,
      speakerCharacterIds: blockSpeakerIds(item.block.rows),
    });
    assertStoreSpace(plan.embedSpace, receipt);
    written += 1;
  }
  await invalidateStale(ctx, plan.scope, staleKeys);
  return { written, skippedEmpty };
}

/** Drop the KNOWN-stale digest rows a pass proved stale and then failed to replace (#1395) — the third
 *  memory delete, beside the shrink reclaim and the content-hash self-heal. No-op on an empty set (the
 *  ordinary pass), so the build's no-op economy is untouched. */
async function invalidateStale(
  ctx: ChatContext,
  scope: MemoryScope,
  keys: readonly { readonly tier: number; readonly blockIdx: number; readonly staleHash: string }[],
): Promise<void> {
  if (keys.length === 0) {
    return;
  }
  await ctx.embeddingsPruneBlocks({ lens: "digest-stale", chatId: scope.chatId, scopedCharacterId: scope.scopedCharacterId, keys });
}

/** Emit the `memory.build` structured trace. Exported so the corpus backfill can emit the SAME per-bucket
 *  trace after it stores tier-0 (PHASE 3) + consolidates corpus-wide (PHASE 4) — observability parity with
 *  the live per-turn path, which emits it via `commitDigestPlan`. */
export function logBuild(
  ctx: ChatContext,
  scope: MemoryScope,
  args: {
    readonly startedAt: number;
    readonly counts: Tier0Counts;
    readonly note?: string | undefined;
  },
): void {
  const { startedAt, counts, note } = args;
  ctx.log({
    event: "memory.build",
    chatId: scope.chatId,
    scopedCharacterId: scope.scopedCharacterId,
    trace: {
      blocksBuilt: counts.written,
      blocksSkipped: counts.skipped,
      summarizeCalls: counts.written,
      embedCalls: counts.written,
      blocksSkippedTokenGuard: counts.skippedTokenGuard,
      blocksSkippedEmpty: counts.skippedEmpty,
      ms: ctx.now() - startedAt,
    },
    ...(note !== undefined ? { note } : {}),
  });
}

/** One complete, stale parent group awaiting consolidation: the target parent + its ordered children + the
 *  summarize input built from their facets. */
interface ConsPending {
  readonly parentBlockIdx: number;
  readonly ordered: readonly DigestRow[];
  readonly parentHash: string;
  readonly input: SummarizeInput;
  /** The hash of the parent row this pending write PROVES stale (undefined ⇒ no parent stored yet, so there
   *  is nothing to invalidate if the summarize comes back empty). Carried from the COLLECT because that is
   *  where the `existing` map is read; the STORE is the half that may need to invalidate (#1543). */
  readonly staleHash: string | undefined;
}

/** One tier's collected consolidation work for a scope: the pending parent writes + the speaker map for their
 *  children + the tally of already-current parents skipped. `parentTier` is the tier the writes land in.
 *  Non-exported — backfill derives it by inference (no-inline-types: no build-internal type in an export). */
interface ConsolidationTierPlan {
  readonly embedSpace: MemoryEmbedSpace;
  readonly parentTier: number;
  readonly pending: readonly ConsPending[];
  readonly speakerMap: ReadonlyMap<string, CharacterId[]>;
  readonly skipped: number;
}

/** Walk tiers 0..maxTier-1, consolidating each complete `fanOut`-group of tier-k digests into a tier-(k+1)
 *  digest; reads each tier from the db so tier-(k+1) consolidates the tier-k rows this pass just wrote. */
async function consolidateTiers(
  ctx: ChatContext,
  scope: MemoryScope,
  args: {
    readonly cfg: ReturnType<typeof resolveCfg>;
    readonly existing: ReadonlyMap<string, string>;
    readonly signal: AbortSignal | undefined;
    readonly funderUserId: UserId;
    readonly embedSpace: MemoryEmbedSpace;
  },
): Promise<PassCounts> {
  const { cfg, existing, signal, funderUserId, embedSpace } = args;
  let written = 0;
  let skipped = 0;
  let skippedEmpty = 0;
  for (let tier = 0; tier < cfg.maxTier; tier += 1) {
    signal?.throwIfAborted();
    const pass = await consolidateOneTier(ctx, scope, cfg, { tier, existing, signal, funderUserId, embedSpace });
    if (pass === null) {
      break; // fewer than fanOut children at this tier → the consolidation ceiling
    }
    written += pass.written;
    skipped += pass.skipped;
    skippedEmpty += pass.skippedEmpty;
  }
  return { written, skipped, skippedEmpty };
}

/** One tier of the LIVE per-turn walk: collect this tier's complete/stale parents, summarize them in ONE
 *  batch, store each. `null` ⇒ fewer than `fanOut` children (the ceiling — the caller stops climbing). Same
 *  three moves the corpus backfill splits apart, kept composed here so the live path is one call per tier. */
async function consolidateOneTier(
  ctx: ChatContext,
  scope: MemoryScope,
  cfg: ReturnType<typeof resolveCfg>,
  args: {
    readonly tier: number;
    readonly existing: ReadonlyMap<string, string>;
    readonly signal: AbortSignal | undefined;
    readonly funderUserId: UserId;
    readonly embedSpace: MemoryEmbedSpace;
  },
): Promise<PassCounts | null> {
  const plan = await collectConsolidationTier(ctx, scope, cfg, args);
  if (plan === null) {
    return null;
  }
  // The live path keeps the RICH per-parent error context (it has it); the corpus backfill's flat batch can't,
  // so it uses `summarizeConsolidationBatch` (flat index). Same summaries, same opts — only the error tag differs.
  const texts = await summarizeBatchIsolated(
    ctx,
    { funderUserId: args.funderUserId, opts: summarizerOpts(ctx) },
    plan.pending.map((p) => p.input),
    (i, err) =>
      getLog().error(
        { err, chatId: scope.chatId, scopedCharacterId: scope.scopedCharacterId, tier: plan.parentTier, blockIdx: plan.pending[i]?.parentBlockIdx },
        "memory digest: consolidation summarize FAILED (isolated — the parent retries next pass)",
      ),
  );
  const stored = await storeConsolidationTier(ctx, scope, plan, texts);
  return { written: stored.written, skipped: plan.skipped, skippedEmpty: stored.skippedEmpty };
}

/** COLLECT one tier's consolidations for a scope (no LLM, no writes): read the tier-k rows, group by parent,
 *  and gather every COMPLETE, stale (hash-changed) group as a pending parent write. `null` ⇒ fewer than
 *  `fanOut` children exist at this tier (the consolidation ceiling — the caller stops climbing). A non-null
 *  plan with empty `pending` means the tier is complete but every parent is already up to date. Split from
 *  the store + summarize so the corpus backfill can gather pending across EVERY bucket before one big batch. */
export async function collectConsolidationTier(
  ctx: ChatContext,
  scope: MemoryScope,
  cfg: ReturnType<typeof resolveCfg>,
  args: {
    readonly tier: number;
    readonly existing: ReadonlyMap<string, string>;
    readonly signal: AbortSignal | undefined;
    readonly funderUserId: UserId;
    readonly embedSpace: MemoryEmbedSpace;
  },
): Promise<ConsolidationTierPlan | null> {
  const { tier, existing, signal } = args;
  const children = await loadDigestsForScope(ctx.db, scope.chatId, scope.scopedCharacterId, { tier, model: args.embedSpace.model });
  if (children.length < cfg.fanOut) {
    return null; // no complete group above this tier → the consolidation ceiling
  }
  const parentTier = tier + 1;
  const groups = groupByParent(children, cfg.fanOut);
  const speakerMap = await loadDigestSpeakers(
    ctx.db,
    children.map((c) => c.id),
  );
  // PROSE-1 census 80/81 — the consolidation system prompt + its user-prompt lead, the ROOM HOST's slots.
  const prose = await ctx.resolveChatProse(scope.chatId);
  const consolidationSystem = consolidationSystemPrompt(prose);
  // #329 P1: the consolidation is fed the children's FULL stored digests (anchor · facts · keywords), fitted to
  // the summarizer context. Feeding only anchor+keywords starved it of the actual facts and it CONFABULATED
  // relations (measured: "Mara married to Alex" when the child tier-0 digest correctly says Sam). The budget
  // is resolved ONCE per tier (the system prompt + output reserve are the same for every parent this pass).
  const consolidationBudget = {
    contextTokens: await ctx.summarizerContextTokens(args.funderUserId),
    systemPromptTokens: estimateTokens(consolidationSystem),
    outputReserveTokens: outputReserve(ctx),
  } as const;
  const pending: ConsPending[] = [];
  let skipped = 0;
  for (const [parentBlockIdx, group] of [...groups].sort((a, b) => a[0] - b[0])) {
    signal?.throwIfAborted();
    if (group.length < cfg.fanOut) {
      continue; // incomplete group — defer until it fills
    }
    const ordered = group.toSorted((a, b) => a.blockIdx - b.blockIdx);
    const parentHash = consolidationHash(
      `${scope.scopedCharacterId}:${parentTier}:${parentBlockIdx}`,
      ordered.map((c) => c.contentHash),
    );
    if (existing.get(`${parentTier}:${parentBlockIdx}`) === parentHash) {
      skipped += 1;
      continue;
    }
    pending.push({
      parentBlockIdx,
      ordered,
      parentHash,
      staleHash: existing.get(`${parentTier}:${parentBlockIdx}`),
      input: {
        systemPrompt: consolidationSystem,
        userPrompt: consolidationUserPrompt(
          prose,
          fitConsolidationChildren(
            ordered.map((c) => c.text),
            consolidationBudget,
          ),
        ),
      },
    });
  }
  return { embedSpace: args.embedSpace, parentTier, pending, speakerMap, skipped };
}

/** The consolidation summarize batch (per-item-isolated on failure) — same wire home as `summarizeDigestBatch`
 *  but its own error tag. In the corpus backfill the flat batch loses per-parent context, so the log carries
 *  only the flat index; the content-hash self-heal retries the dropped parent next pass regardless. */
export function summarizeConsolidationBatch(ctx: ChatContext, funderUserId: UserId, inputs: readonly SummarizeInput[]): Promise<(string | null)[]> {
  return summarizeBatchIsolated(ctx, { funderUserId, opts: summarizerOpts(ctx) }, inputs, (i, err) =>
    getLog().error({ err, index: i }, "memory digest: consolidation summarize FAILED (isolated — the parent retries next pass)"),
  );
}

/** STORE one tier's consolidations: `texts` index-aligned to `plan.pending`; embed-store each parent (blank-arc
 *  empty-skip preserved — a blank digest keyed by parentHash would skip forever, so it retries next pass). The
 *  returned `skipped` is always 0 (the hash-skip tally lives on the plan from the collect); callers add that. */
export async function storeConsolidationTier(
  ctx: ChatContext,
  scope: MemoryScope,
  plan: ConsolidationTierPlan,
  texts: readonly (string | null)[],
): Promise<PassCounts> {
  let written = 0;
  let skippedEmpty = 0;
  const staleKeys: { tier: number; blockIdx: number; staleHash: string }[] = [];
  for (let i = 0; i < plan.pending.length; i += 1) {
    const item = plan.pending[i];
    if (item === undefined) {
      continue;
    }
    const raw = texts[i];
    if (raw === null || raw === undefined || raw.trim().length === 0) {
      skippedEmpty += 1;
      if (item.staleHash !== undefined) {
        staleKeys.push({ tier: plan.parentTier, blockIdx: item.parentBlockIdx, staleHash: item.staleHash });
      }
      continue;
    }
    const parsed = parseDigest(raw);
    // #329 P1b — the OUTPUT-SHAPE guard against DEPTH STARVATION: at tier ≥ 3 the summarizer increasingly
    // returned an anchor + keywords with NO narrative body (the "story so far" for the deep past collapsed to a
    // keyword list). An arc with an empty FACTS body is a degraded consolidation, so it is skipped-and-flagged
    // exactly like a blank digest — NOT stored, the content-hash self-heal retries it next pass (degrade
    // VISIBLY, never silently ship a bodyless arc as canon).
    if (parsed.facts.trim().length === 0) {
      skippedEmpty += 1;
      if (item.staleHash !== undefined) {
        staleKeys.push({ tier: plan.parentTier, blockIdx: item.parentBlockIdx, staleHash: item.staleHash });
      }
      continue;
    }
    const receipt = await ctx.embeddingsStore({
      lens: "digest",
      ownerId: plan.embedSpace.ownerId,
      model: plan.embedSpace.model,
      key: {
        chatId: scope.chatId,
        tier: plan.parentTier,
        blockIdx: item.parentBlockIdx,
        scopedCharacterId: scope.scopedCharacterId,
      },
      text: raw.trim(),
      contentHash: item.parentHash,
      topicAnchor: parsed.topicAnchor,
      keywords: parsed.keywords,
      isGroup: scope.isGroup,
      speakerCharacterIds: unionSpeakers(item.ordered, plan.speakerMap),
    });
    assertStoreSpace(plan.embedSpace, receipt);
    written += 1;
  }
  // #1395 — the same invalidation the tier-0 store applies: a parent queued by a hash mismatch and then
  // skipped (blank, or the #329 P1b bodyless arc) leaves a parent the build has PROVEN stale live in recall.
  await invalidateStale(ctx, scope, staleKeys);
  return { written, skipped: 0, skippedEmpty };
}

/** Group tier-k digests by their parent index (`floor(blockIdx / fanOut)`) — a complete group (length ===
 *  fanOut) consolidates into one tier-(k+1) digest at that parent index. */
function groupByParent(children: readonly DigestRow[], fanOut: number): Map<number, DigestRow[]> {
  const groups = new Map<number, DigestRow[]>();
  for (const c of children) {
    const parent = Math.floor(c.blockIdx / fanOut);
    const list = groups.get(parent) ?? [];
    list.push(c);
    groups.set(parent, list);
  }
  return groups;
}

/** Union a group's contained characters (first-seen order) for the parent digest's `chat_digest_speakers`. */
function unionSpeakers(group: readonly DigestRow[], speakerMap: ReadonlyMap<string, CharacterId[]>): CharacterId[] {
  const seen = new Set<CharacterId>();
  const out: CharacterId[] = [];
  for (const child of group) {
    for (const cid of speakerMap.get(child.id) ?? []) {
      if (!seen.has(cid)) {
        seen.add(cid);
        out.push(cid);
      }
    }
  }
  return out;
}
