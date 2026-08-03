// domain/discovery/themes/backfill — the `digest_theme_assignments.msgMidAt` idempotent backfill (the
// position-median story-time stamp that powers `themeDrift`). Two arms: a tier-0 (scene) digest maps 1:1 to
// a verbatim segment so its seq-span is EXACT; a tier-k (arc) synthesis has no 1:1 segment — its span folds
// the injected memory tier-grid (`Tier0RangeOp`, the ONE home of the fanOut math) over the chat's verbatim
// block grid: covered tier-0 range → `[min(seqStart), max(seqEnd)]`. Both take the position-MEDIAN message
// within the span (NOT the time-interval midpoint — schema/discovery.ts column comment). Idempotent plain
// UPDATE, no id/clock.

import type { Db } from "@orb/db";
import { digestThemeAssignments, messages } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { ChatDigestId, ChatId, UserId } from "@orb/kit/ids";
import { asc, eq, inArray } from "drizzle-orm";
import type { Tier0RangeOp } from "../contract/service.ts";
import { readSegmentBlockSpans, readTier0DigestSpans, readTierKDigestSpans } from "../persistence/embed-store-reads.ts";

interface SeqSpan {
  readonly seqStart: number;
  readonly seqEnd: number;
}

interface Stamp {
  readonly digestId: ChatDigestId;
  readonly chatId: ChatId;
  readonly span: SeqSpan;
}

async function readMessagesByChat(db: Db, chatIds: readonly ChatId[]): Promise<Map<ChatId, { seq: number; createdAt: number }[]>> {
  const byChat = new Map<ChatId, { seq: number; createdAt: number }[]>();
  if (chatIds.length === 0) {
    return byChat;
  }
  const rows = await db
    .select({ chatId: messages.chatId, seq: messages.seq, createdAt: messages.createdAt })
    .from(messages)
    .where(inArray(messages.chatId, [...chatIds]))
    .orderBy(asc(messages.seq));
  for (const r of rows) {
    const bucket = byChat.get(r.chatId);
    if (bucket === undefined) {
      byChat.set(r.chatId, [{ seq: r.seq, createdAt: r.createdAt }]);
    } else {
      bucket.push({ seq: r.seq, createdAt: r.createdAt });
    }
  }
  return byChat;
}

// `chatMsgs` is already seq-ascending; the lower-median is at index floor((n-1)/2).
function medianAt(chatMsgs: readonly { seq: number; createdAt: number }[] | undefined, span: SeqSpan): number | null {
  if (chatMsgs === undefined) {
    return null;
  }
  const inSpan = chatMsgs.filter((m) => m.seq >= span.seqStart && m.seq <= span.seqEnd);
  if (inSpan.length === 0) {
    return null;
  }
  return inSpan[Math.floor((inSpan.length - 1) / 2)]?.createdAt ?? null;
}

/** Fold a tier-k digest's covered tier-0 blockIdx range over the chat's verbatim block grid → the whole
 *  seq-span. `null` when no covered block has a segment row (nothing to span — stays unstamped). */
function tierKSeqSpan(
  blockGrid: ReadonlyMap<ChatId, ReadonlyMap<number, SeqSpan>>,
  digest: { readonly chatId: ChatId; readonly tier: number; readonly blockIdx: number },
  tier0RangeOf: Tier0RangeOp,
): SeqSpan | null {
  const grid = blockGrid.get(digest.chatId);
  if (grid === undefined) {
    return null;
  }
  const { startIdx, endIdx } = tier0RangeOf(digest.tier, digest.blockIdx);
  let seqStart = Number.POSITIVE_INFINITY;
  let seqEnd = Number.NEGATIVE_INFINITY;
  for (let b = startIdx; b <= endIdx; b += 1) {
    const block = grid.get(b);
    if (block !== undefined) {
      seqStart = Math.min(seqStart, block.seqStart);
      seqEnd = Math.max(seqEnd, block.seqEnd);
    }
  }
  return seqStart <= seqEnd ? { seqStart, seqEnd } : null;
}

/**
 * Stamp `digest_theme_assignments.msgMidAt` for every assigned digest — tier-0 via the exact 1:1 segment
 * span, tier-k via the injected tier-grid fold. Idempotent (recomputes the same immutable stamp). Returns
 * the count of digests stamped. Standalone `(db, tier0RangeOf, ownerId?)` so the service factory and
 * `computeThemes` both drive it with the ctx-bound grid op.
 */
export async function backfillMsgMidAt(db: Db, tier0RangeOf: Tier0RangeOp, ownerId?: UserId | null): Promise<{ stamped: number }> {
  const [tier0Spans, tierKDigests] = await Promise.all([readTier0DigestSpans(db, ownerId), readTierKDigestSpans(db, ownerId)]);
  if (tier0Spans.length === 0 && tierKDigests.length === 0) {
    return { stamped: 0 };
  }

  // The tier-k arm needs the verbatim block grid of its chats to fold covered ranges into seq-spans.
  const tierKChatIds = [...new Set(tierKDigests.map((d) => d.chatId))];
  const segmentSpans = await readSegmentBlockSpans(db, tierKChatIds);
  const blockGrid = new Map<ChatId, Map<number, SeqSpan>>();
  for (const s of segmentSpans) {
    const grid = blockGrid.get(s.chatId) ?? new Map<number, SeqSpan>();
    grid.set(s.blockIdx, { seqStart: s.seqStart, seqEnd: s.seqEnd });
    blockGrid.set(s.chatId, grid);
  }

  const stamps: Stamp[] = [
    ...tier0Spans.map((s) => ({
      digestId: s.digestId,
      chatId: s.chatId,
      span: { seqStart: s.seqStart, seqEnd: s.seqEnd },
    })),
    ...tierKDigests.flatMap((d) => {
      const span = tierKSeqSpan(blockGrid, d, tier0RangeOf);
      return span === null ? [] : [{ digestId: d.digestId, chatId: d.chatId, span }];
    }),
  ];

  const byChat = await readMessagesByChat(db, [...new Set(stamps.map((s) => s.chatId))]);

  const updates: BatchStmt[] = [];
  for (const { digestId, chatId, span } of stamps) {
    const at = medianAt(byChat.get(chatId), span);
    if (at === null) {
      continue;
    }
    updates.push(db.update(digestThemeAssignments).set({ msgMidAt: at }).where(eq(digestThemeAssignments.digestId, digestId)));
  }
  if (updates.length > 0) {
    await db.batch(batchMany(updates));
  }
  return { stamped: updates.length };
}
