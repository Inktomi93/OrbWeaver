// domain/chat/memory/build/segments — the VERBATIM segment builder (§2a). Every COMPLETE, aged-out block's
// raw transcript is embedded THROUGH `ctx.embeddingsStore` (lens `segment`) — the ground-truth a digest hit
// resolves back to (seq-span → canon). Segments are NOT scope-keyed (`chat_segments` is `(chatId, blockIdx)` —
// shared per chat, regardless of group bucketing); the verbatim TEXT is not persisted on the row (only the
// embedding + the seq-span pointer — the substrate stays a pure function of canon).
//
// SELF-HEAL on the content hash (a swipe/edit at the protected tip never touches a settled segment).
// DETERMINISM (D46): blockIdx order; injected embed; no clock/random. NO ownerId (D20 — chat FK derives owner).

import type { ChatId } from "@orb/kit/ids";
import type { RowMacroNameContext } from "@orb/kit/macro";
import type { ChatContext } from "../../context.ts";
import { resolveCfg } from "../constants.ts";
import { loadCanonThroughSeq, loadChatMeta, loadSegmentHashes } from "../persistence/queries.ts";
import type { MemoryConfig, MemoryPassCounts } from "../types.ts";
import { blockHash, EMPTY_MACRO_NAMES, renderTranscript, sliceBlocks } from "./substrate/transcript.ts";

/** What `generateSegments` needs (file-local, NON-exported — the `types-in-contract` gate; caller passes a
 *  structural literal). Segments are chat-wide, so this takes a bare `chatId` (no scope bucket). */
interface GenerateSegmentsArgs {
  readonly chatId: ChatId;
  readonly config?: MemoryConfig | null | undefined;
  readonly macroNames?: RowMacroNameContext | undefined;
  readonly signal?: AbortSignal | undefined;
}

/**
 * Generate (and self-heal) the verbatim segments for ONE chat — post-turn fire-and-forget / import backfill.
 * Same cutoff as the digest build (`maxSeq − verbatimWindow`): only complete, aged-out blocks. `mode: 'off'`
 * (D36) → a no-op. Returns the written/skipped counts.
 */
export async function generateSegments(ctx: ChatContext, args: GenerateSegmentsArgs): Promise<MemoryPassCounts> {
  const cfg = resolveCfg(args.config);
  if (cfg.mode === "off") {
    return { written: 0, skipped: 0 };
  }
  const macroNames = args.macroNames ?? EMPTY_MACRO_NAMES;

  const { maxSeq } = await loadChatMeta(ctx.db, args.chatId);
  const cutoff = maxSeq - cfg.verbatimWindow;
  if (cutoff < cfg.blockSize) {
    return { written: 0, skipped: 0 };
  }

  const canon = await loadCanonThroughSeq(ctx.db, args.chatId, cutoff);
  const blocks = sliceBlocks(canon, cfg.blockSize);
  // The SHRINK reclaim (the digest build's twin): the content-hash self-heal only reaches a block that still
  // EXISTS, so a block that VANISHED when the ingest set shrank would otherwise keep its segment forever. A
  // stale segment is not merely dead weight — it carries the `(seqStart, seqEnd)` span the recall witnessing
  // filter resolves digest hits through, so it would map a live hit onto rows that are no longer ingested.
  await ctx.embeddingsPruneBlocks({ lens: "segment", chatId: args.chatId, keepBlockCount: blocks.length });
  const existing = await loadSegmentHashes(ctx.db, args.chatId);

  let written = 0;
  let skipped = 0;
  for (const block of blocks) {
    args.signal?.throwIfAborted();
    const hash = blockHash(`seg:${block.blockIdx}`, block.rows);
    if (existing.get(block.blockIdx) === hash) {
      skipped += 1;
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: the embed is metered + ordered (idempotent upsert per block) — segments are stored sequentially, not fanned out.
    await ctx.embeddingsStore({
      lens: "segment",
      chatId: args.chatId,
      blockIdx: block.blockIdx,
      seqStart: block.seqStart,
      seqEnd: block.seqEnd,
      text: renderTranscript(block.rows, macroNames),
      contentHash: hash,
    });
    written += 1;
  }
  return { written, skipped };
}
