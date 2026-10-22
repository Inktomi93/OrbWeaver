// Tag producers own admission, normalization and injected-clock births; captures retain the persisted rows unchanged.
import { characterTags, chatTags, personaTags, presetTags, tags, worldBookTags } from "@orb/db";
import type { ServicesResult } from "@orb/server/entry/compose";
import { and, eq } from "drizzle-orm";
import type { ServerProducerRoot } from "../server.ts";

type TagService = ServicesResult["services"]["tag"];

export type TagRow = typeof tags.$inferSelect;
export type CharacterTagRow = typeof characterTags.$inferSelect;
export type ChatTagRow = typeof chatTags.$inferSelect;
export type WorldBookTagRow = typeof worldBookTags.$inferSelect;
export type PersonaTagRow = typeof personaTags.$inferSelect;
export type PresetTagRow = typeof presetTags.$inferSelect;

type AttachParams = Parameters<TagService["attachTag"]>[0];
type TargetlessAttachParams = Omit<AttachParams, "targetType" | "targetId">;

/** Produces a tag through the real owner operation before reading its complete persisted row. */
export async function seedTag(root: ServerProducerRoot, params: Parameters<TagService["createTag"]>[0]): Promise<TagRow> {
  return (await seedCreatedTag(root, params)).row;
}

export interface SeededCreatedTag {
  readonly view: Awaited<ReturnType<TagService["createTag"]>>;
  readonly row: TagRow;
}

/** Retain the native presentation defaults without projecting another tag view from its row. */
export async function seedCreatedTag(root: ServerProducerRoot, params: Parameters<TagService["createTag"]>[0]): Promise<SeededCreatedTag> {
  const db = root.db;
  const createTag = root.services.tag.createTag;
  const view = await createTag(params);
  const row = await db.select().from(tags).where(eq(tags.id, view.id)).get();
  if (row === undefined) {
    throw new Error("production tag creation left no canonical tag row");
  }
  return { view, row };
}

export interface SeededTagPrune {
  readonly result: Awaited<ReturnType<TagService["pruneUnusedTags"]>>;
  readonly before: readonly TagRow[];
  readonly after: readonly TagRow[];
}

/** The owner-wide maintenance operation decides what survives, including pending suggestions. */
export async function seedTagPrune(root: ServerProducerRoot, params: Parameters<TagService["pruneUnusedTags"]>[0]): Promise<SeededTagPrune> {
  const db = root.db;
  const prune = root.services.tag.pruneUnusedTags;
  const before = await db.select().from(tags).where(eq(tags.ownerId, params.principal.userId)).orderBy(tags.id);
  const result = await prune(params);
  const after = await db.select().from(tags).where(eq(tags.ownerId, params.principal.userId)).orderBy(tags.id);
  return { result, before, after };
}

/** The producer decides pending versus accepted; no fixture status or timestamp is substituted. */
export async function seedCharacterTag(
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
export async function seedChatTag(root: ServerProducerRoot, params: TargetlessAttachParams & Pick<ChatTagRow, "chatId">): Promise<ChatTagRow> {
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
export async function seedWorldBookTag(
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
export async function seedPersonaTag(root: ServerProducerRoot, params: TargetlessAttachParams & Pick<PersonaTagRow, "personaId">): Promise<PersonaTagRow> {
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
export async function seedPresetTag(root: ServerProducerRoot, params: TargetlessAttachParams & Pick<PresetTagRow, "presetId">): Promise<PresetTagRow> {
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
