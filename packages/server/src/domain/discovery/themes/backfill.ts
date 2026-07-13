// domain/discovery/themes/backfill — FLAG[PD-39]: the `digest_theme_assignments.msgMidAt` idempotent backfill
// (the position-median story-time stamp that powers `themeDrift`). Tier-0 (scene) only — a tier-0 digest's
// block maps 1:1 to a verbatim segment so its seq-span is exact; tier-k (arc) needs the memory `fanOut` seam
// and is deferred (`msgMidAt` stays null, `themeDrift` filters it out). Idempotent plain UPDATE, no id/clock.

import type { BatchStmt, Db } from "@orb/db";
import { batchMany, digestThemeAssignments, messages } from "@orb/db";
import type { ChatId, UserId } from "@orb/kit/ids";
import { asc, eq, inArray } from "drizzle-orm";
import { readTier0DigestSpans } from "../persistence/embed-store-reads";

type DigestSpan = Awaited<ReturnType<typeof readTier0DigestSpans>>[number];

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

// `chatMsgs` is already seq-ascending; the lower-median is at index floor((n-1)/2).
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
