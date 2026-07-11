// domain/discovery/persistence/message-reads — the SEMANTIC `messages` projection (the discovery side of the
// stats↔discovery seam, stats-discovery-seam.md Tier 2). discovery reads `messages` ONLY through
// role/createdAt/characterId (the semantic columns) — it NEVER names an economics column (tokens/cost live on
// `message_variants`; those arrive pre-aggregated through the injected `stats` op). So a discovery query that
// tried to SUM `tokens_out` cannot be written here (Knowledge-Cluster inv #5, economics ⟂ semantics).
//
// OWNER DERIVATION (D23): scope via `messages.character_id → characters.owner_id`; synthetic group characters
// (no card) are excluded (mirrors the distill/insights convention).

import type { Db } from "@orb/db";
import { assets, characters, messages } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { and, eq, sql } from "drizzle-orm";

// One forgotten-gem CANDIDATE — the SEMANTIC investment signal (assistant-message volume + recency) plus the
// display identity. File-local + non-exported (consumers infer it — the persistence no-inline-types posture).
interface ForgottenGemCandidateRow {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
  readonly messageCount: number;
  readonly lastActiveAt: number;
}

/** Every owned, non-synthetic character that has ≥1 assistant message, with its assistant-message COUNT (the
 *  investment signal) + the most-recent message time (recency) + display identity. Owner-scoped via
 *  `characters.owner_id`. Economics are NOT read here — they arrive through the injected stats op. */
export async function readForgottenGemCandidates(
  db: Db,
  ownerId: UserId,
): Promise<ForgottenGemCandidateRow[]> {
  const messageCount = sql<number>`count(${messages.id})`;
  const lastActiveAt = sql<number>`max(${messages.createdAt})`;
  const rows = await db
    .select({
      characterId: characters.id,
      name: characters.name,
      avatarHash: assets.hash,
      messageCount,
      lastActiveAt,
    })
    .from(messages)
    .innerJoin(characters, eq(characters.id, messages.characterId))
    .leftJoin(assets, eq(assets.id, characters.avatarAssetId))
    .where(
      and(
        eq(characters.ownerId, ownerId),
        eq(characters.synthetic, false),
        eq(messages.role, "assistant"),
      ),
    )
    .groupBy(characters.id);
  return rows.map((r) => ({
    characterId: r.characterId,
    name: r.name,
    avatarHash: r.avatarHash,
    messageCount: r.messageCount,
    lastActiveAt: r.lastActiveAt,
  }));
}
