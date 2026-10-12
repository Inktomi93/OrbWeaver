import type { Db } from "@orb/db";
import type { ChatContext } from "#domain/chat";
import { readOwnedDistillates } from "../persistence/summary-reads.ts";
/** Return only the owner-scoped distillate projections, keyed by their canonical character identity. */
export function createResolveOwnedDistillates(db: Db): ChatContext["resolveCharacterDistillates"] {
  return async (ownerId, characterIds) => new Map((await readOwnedDistillates(db, ownerId, characterIds)).map((row) => [row.characterId, row] as const));
}
