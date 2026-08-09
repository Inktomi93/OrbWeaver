// domain/chat/memory/build/digests — the digest builder. Block-summarize each complete, aged-out `blockSize`
// block via ctx.summarize, parse the three-part unit, write the digest through ctx.embeddingsStore (the one
// vector-write path — memory holds no cosine, no direct INSERT), then consolidate upward (fanOut tier-k
// digests → one tier-(k+1) digest, the bounded "story so far").
//
// SELF-HEAL: a block is (re)digested only if missing or its content_hash changed — the protected tip
// (maxSeq − verbatimWindow) never digests, so a swipe/edit at the live tip never touches a settled digest.

import type { SummarizeInput, SummarizeOptions } from "@orb/contracts/role-clients";
import { DEFAULT_MEMORY_SUMMARIZER_PRESENCE_PENALTY } from "@orb/contracts/settings";
import type { CharacterId } from "@orb/kit/ids";
import type { RowMacroNameContext } from "@orb/kit/macro";
import { estimateTokens } from "@orb/kit/tokens";
import { getLog } from "#foundation/observability";
import type { ChatContext } from "../../context.ts";
import { resolveCfg } from "../constants.ts";
import { loadCanonThroughSeq, loadChatMeta, loadDigestHashes, loadDigestSpeakers, loadDigestsForScope } from "../persistence/queries.ts";
import type { BlockSpan, DigestRow, MemoryConfig, MemoryPassCounts, MemoryScope, WitnessInterval } from "../types.ts";
import { parseDigest, renderDigestFacets } from "./substrate/parse.ts";
import { consolidationSystemPrompt, consolidationUserPrompt, digestSystemPrompt, digestUserPrompt } from "./substrate/prompts.ts";
import { DEFAULT_OUTPUT_RESERVE_TOKENS, fitBlockToBudget, SUMMARIZER_CONTEXT_FLOOR } from "./substrate/token-guard.ts";
import { blockHash, blockSpeakerIds, consolidationHash, EMPTY_MACRO_NAMES, renderTranscript, sliceBlocks } from "./substrate/transcript.ts";
import { spanWitnessed } from "./substrate/witnessing.ts";

/** `witnessing`, when present, is the scoped-build gate: only blocks the scope character was present for (its
 *  join/leave horizons) are digested into its bucket. Absent ⇒ the shared (merged/narrator) build. */
interface GenerateDigestsArgs {
  readonly scope: MemoryScope;
  readonly config?: MemoryConfig | null | undefined;
  readonly macroNames?: RowMacroNameContext | undefined;
  readonly witnessing?: readonly WitnessInterval[] | undefined;
  readonly signal?: AbortSignal | undefined;
}

/** The admin-resolved summarize call options (`AppSettings.memorySummarizer`) — passed onto every `summarize`
 *  call. The summarizer keeps its OWN sampler knobs (owner ruling 2026-08-08 — NOT coupled to chat presets):
 *  each admin-set knob rides; an unset knob falls to the engine default, EXCEPT `presencePenalty`, which
 *  ALWAYS rides at the Qwen3-VL loop-stopping default when unset (the whole point of the fix — the summarize
 *  wire does not inherit the vLLM chat surface's per-request presence default, so a repetition_penalty=1.0
 *  model would loop to maxTokens / the request cut). A deliberate admin override (including 0) wins. */
function summarizerOpts(ctx: ChatContext): SummarizeOptions {
  const s = ctx.memorySummarizer;
  return {
    ...(s.maxTokens !== undefined ? { maxTokens: s.maxTokens } : {}),
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
  inputs: readonly SummarizeInput[],
  opts: SummarizeOptions,
  onItemError: (index: number, err: unknown) => void,
): Promise<(string | null)[]> {
  if (inputs.length === 0) {
    return [];
  }
  try {
    const res = await ctx.summarize([...inputs], opts);
    return inputs.map((_, i) => res.items.at(i)?.text ?? null);
  } catch {
    const out: (string | null)[] = [];
    for (let i = 0; i < inputs.length; i += 1) {
      const input = inputs[i];
      if (input === undefined) {
        out.push(null);
        continue;
      }
      try {
        // biome-ignore lint/performance/noAwaitInLoops: the isolation fallback runs ONLY after a batch rejection — each item is retried alone so a poison item loses only itself while its siblings persist.
        const res = await ctx.summarize([input], opts);
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

/** A consolidation pass's fold (no token-guard tier — consolidations read stored facets, not raw blocks). */
interface PassCounts {
  written: number;
  skipped: number;
  skippedEmpty: number;
}

/** Generate (and self-heal) the digests for ONE chat + scope bucket. Never blocks a reply — the caller runs
 *  it off the hot path. `mode: 'off'` → a no-op. */
export async function generateDigests(ctx: ChatContext, args: GenerateDigestsArgs): Promise<MemoryPassCounts> {
  const startedAt = ctx.now();
  const cfg = resolveCfg(args.config);
  const { chatId, scopedCharacterId } = args.scope;
  const emptyCounts: Tier0Counts = {
    written: 0,
    skipped: 0,
    skippedTokenGuard: 0,
    skippedEmpty: 0,
  };
  if (cfg.mode === "off") {
    logBuild(ctx, args.scope, { startedAt, counts: emptyCounts, note: "mode off" });
    return { written: 0, skipped: 0 };
  }
  if (ctx.summarizerContextTokens < SUMMARIZER_CONTEXT_FLOOR) {
    logBuild(ctx, args.scope, {
      startedAt,
      counts: emptyCounts,
      note: "summarizer context below floor",
    });
  }
  const macroNames = args.macroNames ?? EMPTY_MACRO_NAMES;

  const { maxSeq } = await loadChatMeta(ctx.db, chatId);
  const cutoff = maxSeq - cfg.verbatimWindow;
  if (cutoff < cfg.blockSize) {
    logBuild(ctx, args.scope, { startedAt, counts: emptyCounts, note: "no aged-out block" });
    return { written: 0, skipped: 0 };
  }

  const canon = await loadCanonThroughSeq(ctx.db, chatId, cutoff);
  const allBlocks = sliceBlocks(canon, cfg.blockSize);
  const blocks = args.witnessing === undefined ? allBlocks : allBlocks.filter((b) => spanWitnessed(b.seqStart, b.seqEnd, args.witnessing ?? []));
  // THE SHRINK RECLAIM, before anything reads the stored rows (see `blockCeilings`). It runs FIRST — not in
  // the store-then-prune order its `pruneDocumentChunks` sibling uses — because the consolidation pass below
  // reads the stored tier-k rows to build tier-(k+1): leaving an orphan in place for one more pass would fold
  // the vanished block's summary INTO a fresh parent, laundering it back into the pool through a row whose
  // hash is legitimately current. Nothing is re-stored by this call, so the build's no-op economy is intact.
  await ctx.embeddingsPruneBlocks({ lens: "digest", chatId, scopedCharacterId, keepPerTier: blockCeilings(allBlocks.length, cfg.fanOut, cfg.maxTier) });
  const existing = await loadDigestHashes(ctx.db, chatId, scopedCharacterId);

  const counts = await buildTier0(ctx, args, { blocks, existing, macroNames });
  const consolidated = await consolidateTiers(ctx, args.scope, {
    cfg,
    existing,
    signal: args.signal,
  });
  const total: Tier0Counts = {
    written: counts.written + consolidated.written,
    skipped: counts.skipped + consolidated.skipped,
    skippedTokenGuard: counts.skippedTokenGuard,
    skippedEmpty: counts.skippedEmpty + consolidated.skippedEmpty,
  };
  logBuild(ctx, args.scope, { startedAt, counts: total });
  return { written: total.written, skipped: total.skipped };
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

/** The tier-0 pass: one digest per complete, aged-out, witnessed block. */
async function buildTier0(
  ctx: ChatContext,
  args: GenerateDigestsArgs,
  env: {
    readonly blocks: readonly BlockSpan[];
    readonly existing: ReadonlyMap<string, string>;
    readonly macroNames: RowMacroNameContext;
  },
): Promise<Tier0Counts> {
  const { chatId, scopedCharacterId, isGroup } = args.scope;
  const counts: Tier0Counts = { written: 0, skipped: 0, skippedTokenGuard: 0, skippedEmpty: 0 };
  // PROSE-1 census 78 — the digest instruction is the ROOM HOST's slot. Resolved ONCE per pass, and the
  // token guard fits against the RESOLVED text (a longer override must shrink the block, not overflow it).
  const systemPrompt = digestSystemPrompt(await ctx.resolveChatProse(chatId));
  const systemPromptTokens = estimateTokens(systemPrompt);
  // PASS 1 — walk the block grid: skip settled blocks (content-hash self-heal) and token-guard-doomed blocks,
  // and COLLECT the rest as one batch (a per-block single ran the surface's worker pool at count 1 → no vLLM
  // continuous batching; batching all block-summarizes fans them across the bounded pool → concurrent).
  const pending: { readonly block: BlockSpan; readonly hash: string; readonly input: SummarizeInput }[] = [];
  for (const block of env.blocks) {
    args.signal?.throwIfAborted();
    const hash = blockHash(`${scopedCharacterId}:0:${block.blockIdx}`, block.rows);
    if (env.existing.get(`0:${block.blockIdx}`) === hash) {
      counts.skipped += 1;
      continue;
    }
    const fitted = fitBlockToBudget(block.rows, env.macroNames, ctx.summarizerContextTokens, systemPromptTokens, outputReserve(ctx));
    if (fitted === null) {
      counts.skippedTokenGuard += 1;
      continue;
    }
    pending.push({ block, hash, input: { systemPrompt, userPrompt: digestUserPrompt(renderTranscript(fitted, env.macroNames)) } });
  }
  // PASS 2 — ONE batched summarize (per-item-isolated on failure), then store each result index-aligned. The
  // content-hash self-heal + empty-skip are preserved per block (a blank digest keyed by the block hash would
  // skip forever, so it is left un-digested to retry next pass).
  const texts = await summarizeBatchIsolated(ctx, pending.map((p) => p.input), summarizerOpts(ctx), (i, err) =>
    getLog().error(
      { err, chatId, scopedCharacterId, tier: 0, blockIdx: pending[i]?.block.blockIdx },
      "memory digest: tier-0 block summarize FAILED (isolated — the block retries next pass)",
    ),
  );
  for (let i = 0; i < pending.length; i += 1) {
    const item = pending[i];
    if (item === undefined) {
      continue;
    }
    const raw = texts[i];
    if (raw === null || raw === undefined || raw.trim().length === 0) {
      counts.skippedEmpty += 1;
      continue;
    }
    const parsed = parseDigest(raw);
    // biome-ignore lint/performance/noAwaitInLoops: the LLM fan-out already happened as ONE batch above; this loop is only the metered/ordered embed-store upserts (idempotent per block).
    await ctx.embeddingsStore({
      lens: "digest",
      key: { chatId, tier: 0, blockIdx: item.block.blockIdx, scopedCharacterId },
      text: raw.trim(),
      contentHash: item.hash,
      topicAnchor: parsed.topicAnchor,
      keywords: parsed.keywords,
      isGroup,
      speakerCharacterIds: blockSpeakerIds(item.block.rows),
    });
    counts.written += 1;
  }
  return counts;
}

/** Emit the `memory.build` structured trace. */
function logBuild(
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

/** Walk tiers 0..maxTier-1, consolidating each complete `fanOut`-group of tier-k digests into a tier-(k+1)
 *  digest; reads each tier from the db so tier-(k+1) consolidates the tier-k rows this pass just wrote. */
async function consolidateTiers(
  ctx: ChatContext,
  scope: MemoryScope,
  args: {
    readonly cfg: ReturnType<typeof resolveCfg>;
    readonly existing: ReadonlyMap<string, string>;
    readonly signal: AbortSignal | undefined;
  },
): Promise<PassCounts> {
  const { cfg, existing, signal } = args;
  let written = 0;
  let skipped = 0;
  let skippedEmpty = 0;
  for (let tier = 0; tier < cfg.maxTier; tier += 1) {
    signal?.throwIfAborted();
    // biome-ignore lint/performance/noAwaitInLoops: a tier consolidates the PRIOR tier's rows — the read at tier k depends on the writes at tier k-1, so the walk is inherently sequential.
    const children = await loadDigestsForScope(ctx.db, scope.chatId, scope.scopedCharacterId, tier);
    if (children.length < cfg.fanOut) {
      break; // no complete group above this tier → the consolidation ceiling
    }
    const groups = groupByParent(children, cfg.fanOut);
    const childIds = children.map((c) => c.id);
    const speakerMap = await loadDigestSpeakers(ctx.db, childIds);
    const pass = await writeConsolidations(ctx, scope, cfg, {
      tier,
      groups,
      speakerMap,
      existing,
      signal,
    });
    written += pass.written;
    skipped += pass.skipped;
    skippedEmpty += pass.skippedEmpty;
  }
  return { written, skipped, skippedEmpty };
}

/** One parent digest per complete `fanOut`-group; the parent's blockIdx = `floor(childBlockIdx/fanOut)`. */
async function writeConsolidations(
  ctx: ChatContext,
  scope: MemoryScope,
  cfg: ReturnType<typeof resolveCfg>,
  env: {
    readonly tier: number;
    readonly groups: ReadonlyMap<number, DigestRow[]>;
    readonly speakerMap: ReadonlyMap<string, CharacterId[]>;
    readonly existing: ReadonlyMap<string, string>;
    readonly signal: AbortSignal | undefined;
  },
): Promise<PassCounts> {
  let written = 0;
  let skipped = 0;
  let skippedEmpty = 0;
  const parentTier = env.tier + 1;
  // PROSE-1 census 80/81 — the consolidation system prompt + its user-prompt lead, the ROOM HOST's slots.
  const prose = await ctx.resolveChatProse(scope.chatId);
  const consolidationSystem = consolidationSystemPrompt(prose);
  // PASS 1 — collect every complete, stale (hash-changed) parent group as one batch (mirrors buildTier0:
  // batching the consolidations fans them across the surface's worker pool instead of one-at-a-time singles).
  const pending: { readonly parentBlockIdx: number; readonly ordered: readonly DigestRow[]; readonly parentHash: string; readonly input: SummarizeInput }[] = [];
  for (const [parentBlockIdx, group] of [...env.groups].sort((a, b) => a[0] - b[0])) {
    env.signal?.throwIfAborted();
    if (group.length < cfg.fanOut) {
      continue; // incomplete group — defer until it fills
    }
    const ordered = group.toSorted((a, b) => a.blockIdx - b.blockIdx);
    const parentHash = consolidationHash(
      `${scope.scopedCharacterId}:${parentTier}:${parentBlockIdx}`,
      ordered.map((c) => c.contentHash),
    );
    if (env.existing.get(`${parentTier}:${parentBlockIdx}`) === parentHash) {
      skipped += 1;
      continue;
    }
    pending.push({
      parentBlockIdx,
      ordered,
      parentHash,
      input: { systemPrompt: consolidationSystem, userPrompt: consolidationUserPrompt(prose, ordered.map((c) => renderDigestFacets(c))) },
    });
  }
  // PASS 2 — ONE batched summarize (per-item-isolated on failure), then store each parent index-aligned. The
  // blank-arc empty-skip is preserved (a blank digest keyed by parentHash would skip forever, so it retries).
  const texts = await summarizeBatchIsolated(ctx, pending.map((p) => p.input), summarizerOpts(ctx), (i, err) =>
    getLog().error(
      { err, chatId: scope.chatId, scopedCharacterId: scope.scopedCharacterId, tier: parentTier, blockIdx: pending[i]?.parentBlockIdx },
      "memory digest: consolidation summarize FAILED (isolated — the parent retries next pass)",
    ),
  );
  for (let i = 0; i < pending.length; i += 1) {
    const item = pending[i];
    if (item === undefined) {
      continue;
    }
    const raw = texts[i];
    if (raw === null || raw === undefined || raw.trim().length === 0) {
      skippedEmpty += 1;
      continue;
    }
    const parsed = parseDigest(raw);
    // biome-ignore lint/performance/noAwaitInLoops: the LLM fan-out already happened as ONE batch above; this loop is only the metered/ordered embed-store upserts (idempotent per parent).
    await ctx.embeddingsStore({
      lens: "digest",
      key: {
        chatId: scope.chatId,
        tier: parentTier,
        blockIdx: item.parentBlockIdx,
        scopedCharacterId: scope.scopedCharacterId,
      },
      text: raw.trim(),
      contentHash: item.parentHash,
      topicAnchor: parsed.topicAnchor,
      keywords: parsed.keywords,
      isGroup: scope.isGroup,
      speakerCharacterIds: unionSpeakers(item.ordered, env.speakerMap),
    });
    written += 1;
  }
  return { written, skipped, skippedEmpty };
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
