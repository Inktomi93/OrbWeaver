// domain/chat/memory/build/digests — the DIGEST builder (the ST-summarizer replacement, §3a). Block-summarize
// each COMPLETE, aged-out `blockSize` block via `ctx.summarize` → parse the three-part unit → write the digest
// THROUGH `ctx.embeddingsStore` (the ONE vector-write path — memory holds NO cosine, NO direct INSERT), then
// CONSOLIDATE upward (`fanOut` tier-k digests → one tier-(k+1) digest, the bounded "story so far", §5).
//
// SELF-HEAL (§3a): a block is (re)digested ONLY if missing or its `content_hash` changed — the protected tip
// (`maxSeq − verbatimWindow`) never digests, so a swipe/edit at the live tip never touches a settled digest.
// DETERMINISM (D46): blocks processed in blockIdx order; the embed + summarize are INJECTED; no clock/random.
// Owner derives via the chat FK (D20 — NO ownerId param/stamp); group-ness is DATA (the `scope`), not a branch.

import type { CharacterId } from "@orb/kit/ids";
import type { RowMacroNameContext } from "@orb/kit/macro";
import { estimateTokens } from "@orb/kit/tokens";
import type { ChatContext } from "../../contract/context";
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

/** What `generateDigests` needs (file-local, NON-exported — the `types-in-contract` gate; callers pass a
 *  structural literal, the `buildAssembleContext` precedent). `config` is the partial `memoryDefaults` (the
 *  composition root threads `AppSettings.memoryDefaults`); `macroNames` is the per-chat name producer
 *  (`characterNamesById`/`personaNamesById`) resolving the summarizer transcript's speaker LABELS + the BODY
 *  `{{char}}`/`{{user}}`/`{{persona}}` macros (live identity — D28 / G1), never the raw typeid/literal macro;
 *  `scope` is the egocentric bucket (a real CharacterId — the synthetic group
 *  char for shared, a cast char for scoped). `witnessing` is the SCOPED-build gate (§4 / inv 12): when present,
 *  only blocks the scope character was present for (its join/leave horizons) are digested into its bucket — a
 *  character genuinely cannot remember a scene it wasn't in, incl. across kick→re-add. ABSENT ⇒ the shared
 *  (merged/narrator) build (no per-character witnessing — the merged room was witnessed by everyone). */
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

/**
 * Generate (and self-heal) the digests for ONE chat + scope bucket — post-turn fire-and-forget / import
 * backfill (same function, §3a). Returns the written/skipped counts. NEVER blocks a reply (the caller runs it
 * off the hot path). `mode: 'off'` (D36 global disable) → a no-op. Host-only keying is the caller's (the scope
 * is built under `runAsUserId`). Emits the `memory.build` structured trace (knowledge-cluster §3a).
 */
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
  // §10 config-time soft-warning: a summarizer context below the floor degrades VISIBLY (the token-guard trims/
  // skips) — never a silent truncation. One greppable line per build pass on a too-small context.
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
  // Not even one COMPLETE aged-out block exists yet — nothing to digest (the tip is protected); ZERO work
  // (no canon load, no summarize, no embed) — the trigger-discipline invariant (inv 10).
  if (cutoff < cfg.blockSize) {
    logBuild(ctx, args.scope, { startedAt, counts: emptyCounts, note: "no aged-out block" });
    return { written: 0, skipped: 0 };
  }

  const canon = await loadCanonThroughSeq(ctx.db, chatId, cutoff);
  const allBlocks = sliceBlocks(canon, cfg.blockSize);
  // SCOPED build (witnessing provided): only blocks this character was present for go into its bucket (§4).
  const blocks =
    args.witnessing === undefined
      ? allBlocks
      : allBlocks.filter((b) => spanWitnessed(b.seqStart, b.seqEnd, args.witnessing ?? []));
  // The pre-pass staleness snapshot (ALL tiers for this bucket) — a parent's check reads its pre-pass hash.
  const existing = await loadDigestHashes(ctx.db, chatId, scopedCharacterId);

  const counts = await buildTier0(ctx, args, { blocks, existing, macroNames });

  // ── tiering: consolidate fanOut tier-k digests → one tier-(k+1) digest (the bounded story-so-far) ──
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

/** The tier-0 pass: one digest per complete, aged-out, WITNESSED block (self-heal on the content hash;
 *  token-guarded summarizer call). Split out to keep `generateDigests` under the cognitive-complexity cap. */
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
    // TOKEN-GUARD (§3a): fit the block to the summarizer's ACTUAL context — trim oldest-within-block, or
    // skip-and-flag when even the newest single message overflows. NEVER a silent tail truncation.
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
    // SKIP-AND-FLAG on empty summarizer output (§3a / D55(8)): storing a blank digest keyed by this block's
    // content-hash would make the staleness gate skip it FOREVER with empty text (permanently absent from
    // `{{memory}}`). Don't store — leave the block un-digested so the NEXT build retries it; flag it visibly.
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

/** Emit the `memory.build` structured trace (knowledge-cluster §3a). `summarizeCalls`/`embedCalls` === the
 *  written count (each newly-stored digest summarized once + embedded once through the one write path). */
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

/** Walk tiers 0..maxTier-1, consolidating each COMPLETE `fanOut`-group of tier-k digests into a tier-(k+1)
 *  digest. Reads each tier from the db (so tier-(k+1) consolidates the tier-(k) rows this pass just wrote);
 *  the parent's staleness key folds in the children's content hashes (re-consolidate iff a child changed). */
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

/** The per-tier consolidation write loop (split out to keep `consolidateTiers` under the cognitive-complexity
 *  cap). One parent digest per COMPLETE `fanOut`-group; the parent's blockIdx = `floor(childBlockIdx/fanOut)`
 *  (so tier-k block j covers tier-0 range `[j·fanOutᵏ, …]` — the bridge coverage math, `bridge.ts`). */
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
      continue; // an incomplete group — defer until it fills (not a skip, just not ready)
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
    // SKIP-AND-FLAG on empty consolidation output (mirrors the tier-0 guard, D55(8)): a blank arc digest keyed
    // by `parentHash` would skip forever with empty text — don't store it, so the next build retries.
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
