// domain/discovery/themes/backfill — PD-39: the `digest_theme_assignments.msgMidAt` idempotent backfill (the
// position-median STORY-TIME stamp that powers `themeDrift`). `msgMidAt` = the `createdAt` of the
// position-MEDIAN message in a digest's seq-span (where the writing happened) — NOT the time-interval
// midpoint. A digest maps back to canon via its `(chatId, blockIdx)`; the VERBATIM `chat_segments` row at the
// same `(chatId, blockIdx)` carries the seq-span, and the median message is the middle message (by seq
// position) within `[seqStart, seqEnd]`.
//
// TIER-0 (scene) ONLY — self-contained + EXACT: a tier-0 digest's block maps 1:1 to a verbatim segment, so
// its span is exact. A tier-k (arc) synthesis has NO 1:1 segment (its `blockIdx` is `floor(childBlockIdx /
// fanOut)` in the tier-k block space — the memory bridge-coverage math, chat/memory/build/digests.ts), so its
// span needs the memory `fanOut` seam. DEFER(promotion): the tier-k `msgMidAt` backfill → when a tier-aware
// span read (the bridge-coverage math) is exposed as an injected seam. `msgMidAt` is nullable, and `themeDrift`
// filters `msgMidAt IS NOT NULL`, so arc drift simply reads empty until that lands (scene drift is complete).
//
// IDEMPOTENT: a re-run recomputes the same stamp (the span + message seq are immutable) — a plain UPDATE. NO
// id minter, NO clock (the value is the message's own historical createdAt). Owner scope (SINGULAR) derives
// via the digest's present chat host (D18); bulk (null) stamps every owner's tier-0 assignments.

import type { BatchStmt, Db } from "@orb/db";
import { batchMany, digestThemeAssignments, messages } from "@orb/db";
import type { ChatId, UserId } from "@orb/kit/ids";
import { asc, eq, inArray } from "drizzle-orm";
import { readTier0DigestSpans } from "../persistence/embed-store-reads";

type DigestSpan = Awaited<ReturnType<typeof readTier0DigestSpans>>[number];

// Every (seq, createdAt) message row for the given chats, grouped by chat, seq-ascending — the median lookup
// material (read once, sliced in-RAM per digest span; no per-digest query).
async function readMessagesByChat(
  db: Db,
  chatIds: readonly ChatId[],
): Promise<Map<ChatId, { seq: number; createdAt: number }[]>> {
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

// The position-median message createdAt within [seqStart, seqEnd] (the lower-median at index floor((n-1)/2)
// by seq order), or null when the span holds no messages. `chatMsgs` is already seq-ascending.
function medianAt(
  chatMsgs: readonly { seq: number; createdAt: number }[] | undefined,
  span: DigestSpan,
): number | null {
  if (chatMsgs === undefined) {
    return null;
  }
  const inSpan = chatMsgs.filter((m) => m.seq >= span.seqStart && m.seq <= span.seqEnd);
  if (inSpan.length === 0) {
    return null;
  }
  return inSpan[Math.floor((inSpan.length - 1) / 2)]?.createdAt ?? null;
}

/**
 * Stamp `digest_theme_assignments.msgMidAt` for every tier-0 (scene) assigned digest. Idempotent (recomputes
 * the same immutable stamp). Returns the count of digests stamped. Standalone `(db, ownerId?)` so the workload
 * runner + service factory both drive it.
 */
export async function backfillMsgMidAt(
  db: Db,
  ownerId?: UserId | null,
): Promise<{ stamped: number }> {
  const spans = await readTier0DigestSpans(db, ownerId);
  if (spans.length === 0) {
    return { stamped: 0 };
  }
  const byChat = await readMessagesByChat(db, [...new Set(spans.map((s) => s.chatId))]);
  const updates: BatchStmt[] = [];
  for (const span of spans) {
    const at = medianAt(byChat.get(span.chatId), span);
    if (at === null) {
      continue;
    }
    updates.push(
      db
        .update(digestThemeAssignments)
        .set({ msgMidAt: at })
        .where(eq(digestThemeAssignments.digestId, span.digestId)),
    );
  }
  if (updates.length > 0) {
    await db.batch(batchMany(updates));
  }
  return { stamped: updates.length };
}
