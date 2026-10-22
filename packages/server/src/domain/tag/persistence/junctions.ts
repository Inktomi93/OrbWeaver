// Per-type junction writes retain the canonical target's kind/id correlation.
// Owned entities gate through fetchOwned; chats gate through membership and retain a per-tagger overlay (D30).

import type { TagStatus } from "@orb/contracts/tag";
import type { Db } from "@orb/db";
import { characters, characterTags, chatTags, personas, personaTags, presets, presetTags, worldBooks, worldBookTags } from "@orb/db";
import { fetchOwned } from "@orb/db/query";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, TagId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import type { BulkInsertJunctionParams, DeleteJunctionParams, InsertJunctionParams, TargetAccessParams } from "../contract/junctions.ts";

/** Gate owned targets by owner and chats by membership; foreign and absent targets share one refusal. */
export async function ensureTargetAccessible(args: TargetAccessParams): Promise<void> {
  let owned: boolean;
  switch (args.targetType) {
    case "chat":
      return args.requireParticipant(args.principal, args.targetId);
    case "character":
      owned = (await fetchOwned(args.db, characters, args.targetId, args.principal.userId)) !== undefined;
      break;
    case "worldBook":
      owned = (await fetchOwned(args.db, worldBooks, args.targetId, args.principal.userId)) !== undefined;
      break;
    case "persona":
      owned = (await fetchOwned(args.db, personas, args.targetId, args.principal.userId)) !== undefined;
      break;
    case "preset":
      owned = (await fetchOwned(args.db, presets, args.targetId, args.principal.userId)) !== undefined;
      break;
    default:
      return args satisfies never;
  }
  if (!owned) {
    throw new DomainNotFoundError(args.targetType, args.targetId);
  }
}

/** Attach one tag; character conflicts update status, while other junction conflicts preserve the row. */
export async function insertJunctionRow(args: InsertJunctionParams): Promise<void> {
  switch (args.targetType) {
    case "character":
      await args.db
        .insert(characterTags)
        .values({ characterId: args.targetId, tagId: args.tagId, status: args.status, createdAt: args.at })
        .onConflictDoUpdate({ target: [characterTags.characterId, characterTags.tagId], set: { status: args.status } });
      return;
    case "chat":
      await args.db.insert(chatTags).values({ chatId: args.targetId, tagId: args.tagId, ownerId: args.taggerId, createdAt: args.at }).onConflictDoNothing();
      return;
    case "worldBook":
      await args.db.insert(worldBookTags).values({ worldBookId: args.targetId, tagId: args.tagId, createdAt: args.at }).onConflictDoNothing();
      return;
    case "persona":
      await args.db.insert(personaTags).values({ personaId: args.targetId, tagId: args.tagId, createdAt: args.at }).onConflictDoNothing();
      return;
    case "preset":
      await args.db.insert(presetTags).values({ presetId: args.targetId, tagId: args.tagId, createdAt: args.at }).onConflictDoNothing();
      return;
    default:
      return args satisfies never;
  }
}

/** Attach one tag to a character, preserving status on conflict for the by-name import path. */
export async function attachCharacterTag(args: {
  readonly db: Db;
  readonly characterId: CharacterId;
  readonly tagId: TagId;
  readonly status: TagStatus;
  readonly at: number;
}): Promise<boolean> {
  const inserted = await args.db
    .insert(characterTags)
    .values({ characterId: args.characterId, tagId: args.tagId, status: args.status, createdAt: args.at })
    .onConflictDoNothing({ target: [characterTags.characterId, characterTags.tagId] })
    .returning({ tagId: characterTags.tagId });
  return inserted.length > 0;
}

/** Detach a character tag without deleting the tag itself. */
export async function detachCharacterTag(args: { readonly db: Db; readonly characterId: CharacterId; readonly tagId: TagId }): Promise<boolean> {
  const deleted = await args.db
    .delete(characterTags)
    .where(and(eq(characterTags.characterId, args.characterId), eq(characterTags.tagId, args.tagId)))
    .returning({ tagId: characterTags.tagId });
  return deleted.length > 0;
}

/** Attach many tags after the verb verifies every tag and the target. */
export async function bulkInsertJunctionRows(args: BulkInsertJunctionParams): Promise<void> {
  switch (args.targetType) {
    case "character":
      await args.db
        .insert(characterTags)
        .values(args.tagIds.map((tagId) => ({ characterId: args.targetId, tagId, status: args.status, createdAt: args.at })))
        .onConflictDoUpdate({ target: [characterTags.characterId, characterTags.tagId], set: { status: args.status } });
      return;
    case "chat":
      await args.db
        .insert(chatTags)
        .values(args.tagIds.map((tagId) => ({ chatId: args.targetId, tagId, ownerId: args.taggerId, createdAt: args.at })))
        .onConflictDoNothing();
      return;
    case "worldBook":
      await args.db
        .insert(worldBookTags)
        .values(args.tagIds.map((tagId) => ({ worldBookId: args.targetId, tagId, createdAt: args.at })))
        .onConflictDoNothing();
      return;
    case "persona":
      await args.db
        .insert(personaTags)
        .values(args.tagIds.map((tagId) => ({ personaId: args.targetId, tagId, createdAt: args.at })))
        .onConflictDoNothing();
      return;
    case "preset":
      await args.db
        .insert(presetTags)
        .values(args.tagIds.map((tagId) => ({ presetId: args.targetId, tagId, createdAt: args.at })))
        .onConflictDoNothing();
      return;
    default:
      return args satisfies never;
  }
}

/** Detach one tag; chat overlays additionally pin the tagger's owner id. */
export async function deleteJunctionRow(args: DeleteJunctionParams): Promise<void> {
  switch (args.targetType) {
    case "character":
      await args.db.delete(characterTags).where(and(eq(characterTags.characterId, args.targetId), eq(characterTags.tagId, args.tagId)));
      return;
    case "chat":
      await args.db.delete(chatTags).where(and(eq(chatTags.chatId, args.targetId), eq(chatTags.tagId, args.tagId), eq(chatTags.ownerId, args.taggerId)));
      return;
    case "worldBook":
      await args.db.delete(worldBookTags).where(and(eq(worldBookTags.worldBookId, args.targetId), eq(worldBookTags.tagId, args.tagId)));
      return;
    case "persona":
      await args.db.delete(personaTags).where(and(eq(personaTags.personaId, args.targetId), eq(personaTags.tagId, args.tagId)));
      return;
    case "preset":
      await args.db.delete(presetTags).where(and(eq(presetTags.presetId, args.targetId), eq(presetTags.tagId, args.tagId)));
      return;
    default:
      return args satisfies never;
  }
}
