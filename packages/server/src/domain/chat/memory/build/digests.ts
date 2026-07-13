// domain/chat/memory/build/digests — the digest builder. Block-summarize each complete, aged-out `blockSize`
// block via ctx.summarize, parse the three-part unit, write the digest through ctx.embeddingsStore (the one
// vector-write path — memory holds no cosine, no direct INSERT), then consolidate upward (fanOut tier-k
// digests → one tier-(k+1) digest, the bounded "story so far").
//
// SELF-HEAL: a block is (re)digested only if missing or its content_hash changed — the protected tip
// (maxSeq − verbatimWindow) never digests, so a swipe/edit at the live tip never touches a settled digest.

import type { CharacterId } from "@orb/kit/ids";
import type { RowMacroNameContext } from "@orb/kit/macro";
import { estimateTokens } from "@orb/kit/tokens";
import type { ChatContext } from "../../context";
import { resolveCfg } from "../constants";
import {
  loadCanonThroughSeq,
  loadChatMeta,
  loadDigestHashes,
  loadDigestSpeakers,
  loadDigestsForScope,
} from "../persistence/queries";
import type {
  BlockSpan,
  DigestRow,
  MemoryConfig,
  MemoryPassCounts,
  MemoryScope,
  WitnessInterval,
} from "../types";
import { parseDigest, renderDigestFacets } from "./substrate/parse";
import {
  CONSOLIDATION_SYSTEM_PROMPT,
  consolidationUserPrompt,
  DIGEST_SYSTEM_PROMPT,
  digestUserPrompt,
} from "./substrate/prompts";
import { fitBlockToBudget, SUMMARIZER_CONTEXT_FLOOR } from "./substrate/token-guard";
import {
  blockHash,
  blockSpeakerIds,
  consolidationHash,
  EMPTY_MACRO_NAMES,
  renderTranscript,
  sliceBlocks,
} from "./substrate/transcript";
import { spanWitnessed } from "./substrate/witnessing";

/** `witnessing`, when present, is the scoped-build gate: only blocks the scope character was present for (its
 *  join/leave horizons) are digested into its bucket. Absent ⇒ the shared (merged/narrator) build. */
interface GenerateDigestsArgs {
  readonly scope: MemoryScope;
  readonly config?: MemoryConfig | null | undefined;
  readonly macroNames?: RowMacroNameContext | undefined;
  readonly witnessing?: readonly WitnessInterval[] | undefined;
  readonly signal?: AbortSignal | undefined;
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
export async function generateDigests(
  ctx: ChatContext,
  args: GenerateDigestsArgs,
): Promise<MemoryPassCounts> {
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
  const blocks =
    args.witnessing === undefined
      ? allBlocks
      : allBlocks.filter((b) => spanWitnessed(b.seqStart, b.seqEnd, args.witnessing ?? []));
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
  const systemPromptTokens = estimateTokens(DIGEST_SYSTEM_PROMPT);
  for (const block of env.blocks) {
    args.signal?.throwIfAborted();
    const hash = blockHash(`${scopedCharacterId}:0:${block.blockIdx}`, block.rows);
    if (env.existing.get(`0:${block.blockIdx}`) === hash) {
      counts.skipped += 1;
      continue;
    }
    const fitted = fitBlockToBudget(
      block.rows,
      env.macroNames,
      ctx.summarizerContextTokens,
      systemPromptTokens,
    );
    if (fitted === null) {
      counts.skippedTokenGuard += 1;
      continue;
    }
    const transcript = renderTranscript(fitted, env.macroNames);
    // biome-ignore lint/performance/noAwaitInLoops: the summarizer is metered + the in-flight set guards spend — blocks are summarized sequentially, not fanned out (knowledge-cluster esoteric).
    const res = await ctx.summarize([
      { systemPrompt: DIGEST_SYSTEM_PROMPT, userPrompt: digestUserPrompt(transcript) },
    ]);
    const raw = res.items.at(0)?.text ?? "";
    // Don't store a blank digest — it'd skip forever under the content-hash staleness gate. Leave un-digested.
    if (raw.trim().length === 0) {
      counts.skippedEmpty += 1;
      continue;
    }
    const parsed = parseDigest(raw);
    // biome-ignore lint/performance/noAwaitInLoops: the digest must be stored before the next block (and before consolidation reads it back) — the writes are ordered, not parallel.
    await ctx.embeddingsStore({
      lens: "digest",
      key: { chatId, tier: 0, blockIdx: block.blockIdx, scopedCharacterId },
      text: raw.trim(),
      contentHash: hash,
      topicAnchor: parsed.topicAnchor,
      keywords: parsed.keywords,
      isGroup,
      speakerCharacterIds: blockSpeakerIds(block.rows),
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
    // biome-ignore lint/performance/noAwaitInLoops: same sequential-tier dependency as the children read above.
    const speakerMap = await loadDigestSpeakers(ctx.db, childIds);
    // biome-ignore lint/performance/noAwaitInLoops: the parent writes for this tier must land before the next tier reads them.
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
  for (const [parentBlockIdx, group] of [...env.groups].sort((a, b) => a[0] - b[0])) {
    env.signal?.throwIfAborted();
    if (group.length < cfg.fanOut) {
      continue; // incomplete group — defer until it fills
    }
    const ordered = [...group].sort((a, b) => a.blockIdx - b.blockIdx);
    const parentHash = consolidationHash(
      `${scope.scopedCharacterId}:${parentTier}:${parentBlockIdx}`,
      ordered.map((c) => c.contentHash),
    );
    if (env.existing.get(`${parentTier}:${parentBlockIdx}`) === parentHash) {
      skipped += 1;
      continue;
    }
    const childFacets = ordered.map((c) => renderDigestFacets(c));
    // biome-ignore lint/performance/noAwaitInLoops: the side-LLM is metered — parents are summarized sequentially (one consolidation at a time), mirroring the tier-0 spend guard.
    const res = await ctx.summarize([
      {
        systemPrompt: CONSOLIDATION_SYSTEM_PROMPT,
        userPrompt: consolidationUserPrompt(childFacets),
      },
    ]);
    const raw = res.items.at(0)?.text ?? "";
    // Mirrors the tier-0 guard: don't store a blank arc digest — it'd skip forever under parentHash.
    if (raw.trim().length === 0) {
      skippedEmpty += 1;
      continue;
    }
    const parsed = parseDigest(raw);
    // biome-ignore lint/performance/noAwaitInLoops: ordered write (the next tier reads it back) — not parallelizable.
    await ctx.embeddingsStore({
      lens: "digest",
      key: {
        chatId: scope.chatId,
        tier: parentTier,
        blockIdx: parentBlockIdx,
        scopedCharacterId: scope.scopedCharacterId,
      },
      text: raw.trim(),
      contentHash: parentHash,
      topicAnchor: parsed.topicAnchor,
      keywords: parsed.keywords,
      isGroup: scope.isGroup,
      speakerCharacterIds: unionSpeakers(ordered, env.speakerMap),
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
function unionSpeakers(
  group: readonly DigestRow[],
  speakerMap: ReadonlyMap<string, CharacterId[]>,
): CharacterId[] {
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
