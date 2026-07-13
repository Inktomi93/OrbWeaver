// domain/discovery/persistence/message-reads — the semantic messages projection. discovery reads messages
// only through role/createdAt/characterId — never an economics column (tokens/cost live on
// message_variants and arrive pre-aggregated through the injected stats op).

import type { Db } from "@orb/db";
import { assets, characters, messages } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { and, eq, sql } from "drizzle-orm";

interface ForgottenGemCandidateRow {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
  readonly messageCount: number;
  readonly lastActiveAt: number;
}

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
