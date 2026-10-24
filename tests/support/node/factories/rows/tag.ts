// Tag rows a production verb left, read behind the rows door for persistence-tier and corpus captures.

import { characterTags, chatTags, personaTags, presetTags, tags, worldBookTags } from "@orb/db";
import { and, eq } from "drizzle-orm";
import type { ServerProducerRoot } from "../../server.ts";
import type {
  CharacterTagRow,
  ChatTagRow,
  PersonaTagRow,
  PresetTagRow,
  SeededTagPrune,
  TagRow,
  TagService,
  TargetlessAttachParams,
  WorldBookTagRow,
} from "../tag.ts";

/** The owner-wide maintenance operation decides what survives, including pending suggestions. */
export async function seedTagPruneRows(root: ServerProducerRoot, params: Parameters<TagService["pruneUnusedTags"]>[0]): Promise<SeededTagPrune> {
  const db = root.db;
  const prune = root.services.tag.pruneUnusedTags;
  const before = await db.select().from(tags).where(eq(tags.ownerId, params.principal.userId)).orderBy(tags.id);
  const result = await prune(params);
  const after = await db.select().from(tags).where(eq(tags.ownerId, params.principal.userId)).orderBy(tags.id);
  return { result, before, after };
}

/** The producer decides pending versus accepted; no fixture status or timestamp is substituted. */
export async function seedCharacterTagRows(
  root: ServerProducerRoot,
  params: TargetlessAttachParams & Pick<CharacterTagRow, "characterId">,
): Promise<CharacterTagRow> {
  const db = root.db;
  const attachTag = root.services.tag.attachTag;
  const { characterId, ...attach } = params;
  await attachTag({ ...attach, targetType: "character", targetId: characterId });
  const row = await db
    .select()
    .from(characterTags)
    .where(and(eq(characterTags.characterId, characterId), eq(characterTags.tagId, params.tagId)))
    .get();
  if (row === undefined) {
    throw new Error("production tag attachment left no canonical character-tag row");
  }
  return row;
}

/** Reads the caller's exact per-tagger overlay, including the owner component of its primary key. */
export async function seedChatTagRows(root: ServerProducerRoot, params: TargetlessAttachParams & Pick<ChatTagRow, "chatId">): Promise<ChatTagRow> {
  const db = root.db;
  const attachTag = root.services.tag.attachTag;
  const { chatId, ...attach } = params;
  await attachTag({ ...attach, targetType: "chat", targetId: chatId });
  const row = await db
    .select()
    .from(chatTags)
    .where(and(eq(chatTags.chatId, chatId), eq(chatTags.tagId, params.tagId), eq(chatTags.ownerId, params.principal.userId)))
    .get();
  if (row === undefined) {
    throw new Error("production tag attachment left no canonical chat-tag overlay");
  }
  return row;
}

/** Produces an owner-admitted book attachment and retains its actual persisted defaults. */
export async function seedWorldBookTagRows(
  root: ServerProducerRoot,
  params: TargetlessAttachParams & Pick<WorldBookTagRow, "worldBookId">,
): Promise<WorldBookTagRow> {
  const db = root.db;
  const attachTag = root.services.tag.attachTag;
  const { worldBookId, ...attach } = params;
  await attachTag({ ...attach, targetType: "worldBook", targetId: worldBookId });
  const row = await db
    .select()
    .from(worldBookTags)
    .where(and(eq(worldBookTags.worldBookId, worldBookId), eq(worldBookTags.tagId, params.tagId)))
    .get();
  if (row === undefined) {
    throw new Error("production tag attachment left no canonical world-book-tag row");
  }
  return row;
}

/** Produces an owner-admitted persona attachment without a second FK or ownership policy. */
export async function seedPersonaTagRows(root: ServerProducerRoot, params: TargetlessAttachParams & Pick<PersonaTagRow, "personaId">): Promise<PersonaTagRow> {
  const db = root.db;
  const attachTag = root.services.tag.attachTag;
  const { personaId, ...attach } = params;
  await attachTag({ ...attach, targetType: "persona", targetId: personaId });
  const row = await db
    .select()
    .from(personaTags)
    .where(and(eq(personaTags.personaId, personaId), eq(personaTags.tagId, params.tagId)))
    .get();
  if (row === undefined) {
    throw new Error("production tag attachment left no canonical persona-tag row");
  }
  return row;
}

/** Produces an owner-admitted preset attachment rather than copying the junction writer. */
export async function seedPresetTagRows(root: ServerProducerRoot, params: TargetlessAttachParams & Pick<PresetTagRow, "presetId">): Promise<PresetTagRow> {
  const db = root.db;
  const attachTag = root.services.tag.attachTag;
  const { presetId, ...attach } = params;
  await attachTag({ ...attach, targetType: "preset", targetId: presetId });
  const row = await db
    .select()
    .from(presetTags)
    .where(and(eq(presetTags.presetId, presetId), eq(presetTags.tagId, params.tagId)))
    .get();
  if (row === undefined) {
    throw new Error("production tag attachment left no canonical preset-tag row");
  }
  return row;
}

export interface SeededCreatedTagRows {
  readonly view: Awaited<ReturnType<TagService["createTag"]>>;
  readonly row: TagRow;
}

/** Retain the native presentation defaults without projecting another tag view from its row. */
export async function seedCreatedTagRows(root: ServerProducerRoot, params: Parameters<TagService["createTag"]>[0]): Promise<SeededCreatedTagRows> {
  const db = root.db;
  const createTag = root.services.tag.createTag;
  const view = await createTag(params);
  const row = await db.select().from(tags).where(eq(tags.id, view.id)).get();
  if (row === undefined) {
    throw new Error("production tag creation left no canonical tag row");
  }
  return { view, row };
}

/** Produces a tag through the real owner operation before reading its complete persisted row. */
export async function seedTagRows(root: ServerProducerRoot, params: Parameters<TagService["createTag"]>[0]): Promise<TagRow> {
  return (await seedCreatedTagRows(root, params)).row;
}
