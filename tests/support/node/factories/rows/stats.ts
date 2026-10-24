// Stats rollup rows a production writer left, read behind the rows door for persistence-tier and corpus captures.

import { characterStats, characters, chats, dailyStats, messages, messageVariants, modelStats, ownerStats, statsCanonVersions } from "@orb/db";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { eq, inArray } from "drizzle-orm";
import type { ServerProducerRoot } from "../../server.ts";
import type { CapturedStatsPopulations, Reconcile, SeededStats } from "../stats.ts";

/** Reconciliation does not create a canon fence for an owner with no live stats mutation. */
export async function seedStatsRows(root: ServerProducerRoot, ownerId: Parameters<Reconcile>[0]): Promise<SeededStats> {
  const db = root.db;
  const reconcile = root.services.stats.reconcile;
  const result = await reconcile(ownerId);
  const owner = await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)).get();
  if (owner === undefined) {
    throw new Error("production reconciliation left no canonical owner-stats row");
  }
  const canonVersion = await db.select().from(statsCanonVersions).where(eq(statsCanonVersions.ownerId, ownerId)).get();
  const characterRows = await db
    .select({ row: characterStats })
    .from(characterStats)
    .innerJoin(characters, eq(characters.id, characterStats.characterId))
    .where(eq(characters.ownerId, ownerId))
    .orderBy(characterStats.characterId);
  const daily = await db.select().from(dailyStats).where(eq(dailyStats.ownerId, ownerId)).orderBy(dailyStats.bucketStart);
  const models = await db.select().from(modelStats).where(eq(modelStats.ownerId, ownerId)).orderBy(modelStats.model, modelStats.provider);
  return { result, owner, canonVersion, characters: characterRows.map(({ row }) => row), daily, models };
}

/** Capture native retained and unstarted populations without reconstructing the stats owner's scope. */
export async function captureStatsPopulations(
  root: ServerProducerRoot,
  ownerId: UserId,
  subjects: { readonly chatIds: readonly ChatId[]; readonly characterIds: readonly CharacterId[] },
): Promise<CapturedStatsPopulations> {
  const db = root.db;
  const stats = root.services.stats;
  const { chatIds, characterIds } = subjects;
  const canon = await db.select().from(messages).where(inArray(messages.chatId, chatIds)).orderBy(messages.id);
  return {
    rows: await seedStatsRows(root, ownerId),
    chats: await db.select().from(chats).where(inArray(chats.id, chatIds)).orderBy(chats.id),
    messages: canon,
    variants: await db
      .select()
      .from(messageVariants)
      .where(
        inArray(
          messageVariants.messageId,
          canon.map((row) => row.id),
        ),
      )
      .orderBy(messageVariants.id),
    overview: await stats.overview(ownerId),
    ownerLatency: await stats.latency(ownerId, { kind: "owner" }),
    models: await stats.byModel(ownerId),
    economics: await stats.characterEconomics(ownerId),
    modelEconomics: await stats.characterModelEconomics(ownerId),
    characters: await Promise.all(characterIds.map((id) => stats.character(ownerId, id))),
    latency: await Promise.all(characterIds.map((characterId) => stats.latency(ownerId, { kind: "character", characterId }))),
  };
}
