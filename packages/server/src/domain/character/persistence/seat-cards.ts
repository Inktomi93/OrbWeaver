import type { Db } from "@orb/db";
import { characters } from "@orb/db";
import { and, eq, inArray } from "drizzle-orm";
import type { LoadSeatCards } from "../contract/service.ts";

/** The roster reads decoration columns only; ownership remains part of the SQL scope. */
export function createLoadSeatCards(db: Db): LoadSeatCards {
  return async (ownerId, characterIds) =>
    characterIds.length === 0
      ? []
      : await db
          .select({
            id: characters.id,
            name: characters.name,
            avatarAssetId: characters.avatarAssetId,
            trustHtml: characters.trustHtml,
            forbidExternalMedia: characters.forbidExternalMedia,
            interactiveHtml: characters.interactiveHtml,
            themeOverride: characters.themeOverride,
            backgroundOverride: characters.backgroundOverride,
          })
          .from(characters)
          .where(and(eq(characters.ownerId, ownerId), inArray(characters.id, [...characterIds])));
}
