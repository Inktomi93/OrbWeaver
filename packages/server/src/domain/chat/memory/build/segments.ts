// domain/chat/memory/build/segments — the VERBATIM segment builder (§2a). Every COMPLETE, aged-out block's
// raw transcript is embedded THROUGH `ctx.embeddingsStoreSegments` (lens `segment`) — the ground-truth a
// digest hit resolves back to (seq-span → canon). Segments are NOT scope-keyed (`chat_segments` is
// `(chatId, blockIdx, chunkIdx)` — shared per chat, regardless of group bucketing); the row stores the
// verbatim text + the embedding + the seq-span pointer (the substrate stays a pure function of canon).
//
// A BLOCK IS A ROW SET (#172). A block whose verbatim transcript exceeds the EMBED model's window is CHUNKED
// into N in-budget pieces — full fidelity, nothing truncated, each piece carrying the honest span of the
// messages it contains (owner ruling, #165: "if we are skimping out on messages that's a no go since this
// feeds the memory system"). Only a block past the PATHOLOGICAL ceiling
// (`MAX_SEGMENT_CHUNKS_PER_BLOCK`) is skipped whole and COUNTED (`skippedOverWindow`) — the #165 arm, kept
// for exactly that case. Nothing here truncates anything, ever.
//
// TWO PHASES, so the corpus sweep can flood (#172, owner batching ruling: batch by PHASE, never per-item
// interleaved). `collectSegments` does the db reads + chunking + hash gate + shrink prune for ONE chat and
// returns the pending chunk writes; `storeSegments` hands a batch to the embeddings op, which embeds every
// chunk in ONE flood and then writes the rows. `generateSegments` = both, for the live post-turn path; the
// backfill collects the WHOLE corpus first and stores once (`substrate/backfill.ts`).
//
// SELF-HEAL on the content hash (a swipe/edit at the protected tip never touches a settled segment).
// DETERMINISM (D46): blockIdx order; injected embed; no clock/random. NO ownerId (D20 — chat FK derives owner).

import type { ChatId, UserId } from "@orb/kit/ids";
import type { RowMacroNameContext } from "@orb/kit/macro";
import { getLog } from "#foundation/observability";
import type { ChatContext } from "../../context.ts";
import type { StoreSegmentParams } from "../../contract/context.ts";
import { resolveCfg } from "../constants.ts";
import { loadCanonThroughSeq, loadChatMeta, loadSegmentHashes } from "../persistence/queries.ts";
import type { MemoryConfig, MsgRow, SegmentPassCounts } from "../types.ts";
import { chunkBlockForEmbedWindow } from "./substrate/token-guard.ts";
import { blockHash, EMPTY_MACRO_NAMES, sliceBlocks } from "./substrate/transcript.ts";

/** What `generateSegments` needs (file-local, NON-exported — the `types-in-contract` gate; caller passes a
 *  structural literal). Segments are chat-wide, so this takes a bare `chatId` (no scope bucket). */
interface GenerateSegmentsArgs {
  readonly chatId: ChatId;
  /** WHOSE embed connection the window guard reads (§8.5b) — the trigger live, the workload's principal on backfill. */
  readonly funderUserId: UserId;
  readonly config?: MemoryConfig | null | undefined;
  readonly macroNames?: RowMacroNameContext | undefined;
  readonly signal?: AbortSignal | undefined;
}

/** One chat's collected segment work: the chunk writes that survived the hash gate, plus the counts the pass
 *  already knows (hash-skipped chunks, blocks past the pathological ceiling). File-local by the same gate. */
interface CollectedSegments {
  readonly pending: readonly StoreSegmentParams[];
  readonly skipped: number;
  readonly skippedOverWindow: number;
}

/** The per-chunk staleness key. Folds the chunk's POSITION and its block's chunk COUNT into the block hash,
 *  so: a content change re-embeds the block (the ids are folded, a rename is not — see {@link blockHash}), a
 *  RE-CHUNK (the embed window changed, so the same content now cuts differently) re-embeds it too, and two
 *  chunks of one block can never collide. Cross-chat collapse still holds — identical content at the same
 *  position hashes identically. */
function chunkHash(blockIdx: number, chunkIdx: number, chunkCount: number, rows: readonly MsgRow[]): string {
  return blockHash(`seg:${blockIdx}:${chunkIdx}/${chunkCount}`, rows);
}

/**
 * PHASE 1 for ONE chat — read canon, chunk every complete aged-out block to the embed window, reclaim the
 * blocks/chunks canon dropped, and return the chunk writes whose hash moved. NO embed, NO vector write.
 * `mode: 'off'` (D36) or a chat with no complete aged-out block ⇒ nothing pending.
 */
export async function collectSegments(ctx: ChatContext, args: GenerateSegmentsArgs): Promise<CollectedSegments> {
  const cfg = resolveCfg(args.config);
  const empty: CollectedSegments = { pending: [], skipped: 0, skippedOverWindow: 0 };
  if (cfg.mode === "off") {
    return empty;
  }
  const macroNames = args.macroNames ?? EMPTY_MACRO_NAMES;

  const { maxSeq } = await loadChatMeta(ctx.db, args.chatId);
  const cutoff = maxSeq - cfg.verbatimWindow;
  if (cutoff < cfg.blockSize) {
    return empty;
  }

  const canon = await loadCanonThroughSeq(ctx.db, args.chatId, cutoff);
  const blocks = sliceBlocks(canon, cfg.blockSize);
  const embedContextTokens = await ctx.embedContextTokens(args.funderUserId);

  const pending: StoreSegmentParams[] = [];
  const chunkCounts: { blockIdx: number; chunkCount: number }[] = [];
  const existing = await loadSegmentHashes(ctx.db, args.chatId);
  let skipped = 0;
  let skippedOverWindow = 0;
  for (const block of blocks) {
    args.signal?.throwIfAborted();
    const chunks = chunkBlockForEmbedWindow(block.rows, macroNames, embedContextTokens);
    if (chunks === null) {
      // THE PATHOLOGICAL CEILING (#165's surviving arm). Not truncated, not partially stored: skipped WHOLE
      // and RECORDED, and left un-stored so the content-hash self-heal re-offers it every pass — it builds
      // the day it fits (a bigger embed window, a shorter block). `chunkCount: 0` reclaims any rows a
      // previous, smaller version of this block left behind.
      skippedOverWindow += 1;
      chunkCounts.push({ blockIdx: block.blockIdx, chunkCount: 0 });
      getLog().warn(
        {
          chatId: args.chatId,
          blockIdx: block.blockIdx,
          seqStart: block.seqStart,
          seqEnd: block.seqEnd,
          rows: block.rows.length,
          embedContextTokens,
        },
        "memory segments: block cannot be chunked into the embed window (past the pathological ceiling) — skipped whole (recorded, never truncated); its span is not retrievable until it fits",
      );
      continue;
    }
    if (chunks.length !== 1) {
      chunkCounts.push({ blockIdx: block.blockIdx, chunkCount: chunks.length });
    }
    for (const chunk of chunks) {
      const hash = chunkHash(block.blockIdx, chunk.chunkIdx, chunks.length, block.rows);
      if (existing.get(`${block.blockIdx}:${chunk.chunkIdx}`) === hash) {
        skipped += 1;
        continue;
      }
      pending.push({
        lens: "segment",
        chatId: args.chatId,
        blockIdx: block.blockIdx,
        chunkIdx: chunk.chunkIdx,
        seqStart: chunk.seqStart,
        seqEnd: chunk.seqEnd,
        text: chunk.text,
        contentHash: hash,
      });
    }
  }

  // The SHRINK reclaim (the digest build's twin): the content-hash self-heal only reaches a block that still
  // EXISTS, so a block that VANISHED when the ingest set shrank would otherwise keep its segment forever. A
  // stale segment is not merely dead weight — it carries the `(seqStart, seqEnd)` span the recall witnessing
  // filter resolves digest hits through, so it would map a live hit onto rows that are no longer ingested.
  // The CHUNK ceilings ride along for the same reason one level down: a block that used to need 5 chunks and
  // now needs 2 would strand three rows still claiming spans.
  await ctx.embeddingsPruneBlocks({ lens: "segment", chatId: args.chatId, keepBlockCount: blocks.length, chunkCounts });
  return { pending, skipped, skippedOverWindow };
}

/**
 * PHASE 2 — hand a collected batch to the ONE vector write path, which embeds every chunk in a single flood
 * and writes the rows. Returns the pass counts. Callers with the whole corpus in hand (the backfill) pass
 * every chat's chunks at once; the live path passes one chat's.
 */
export async function storeSegments(ctx: ChatContext, collected: CollectedSegments): Promise<SegmentPassCounts> {
  if (collected.pending.length > 0) {
    await ctx.embeddingsStoreSegments(collected.pending);
  }
  return { written: collected.pending.length, skipped: collected.skipped, skippedOverWindow: collected.skippedOverWindow };
}

/**
 * Generate (and self-heal) the verbatim segments for ONE chat — post-turn fire-and-forget / import backfill.
 * Same cutoff as the digest build (`maxSeq − verbatimWindow`): only complete, aged-out blocks. Both phases in
 * one call; the corpus sweep drives the two halves separately so its embeds land as ONE flood.
 */
export async function generateSegments(ctx: ChatContext, args: GenerateSegmentsArgs): Promise<SegmentPassCounts> {
  return await storeSegments(ctx, await collectSegments(ctx, args));
}
