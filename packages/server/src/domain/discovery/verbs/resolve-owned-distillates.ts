import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { ChatContext } from "#domain/chat";
import { readOwnedDistillates } from "../persistence/summary-reads.ts";
/** Return only the owner-scoped distillate projections, keyed by their canonical character identity. */
export function createResolveOwnedDistillates(input: DatabaseHandle): ChatContext["resolveCharacterDistillates"] {
  const db = databaseForOwner(input);
  return async (ownerId, characterIds) => new Map((await readOwnedDistillates(db, ownerId, characterIds)).map((row) => [row.characterId, row] as const));
}
