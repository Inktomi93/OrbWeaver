// Tag seeds run the production verbs and return their outcomes; rows-tier twins in `rows/tag.ts` read the rows.

import type { characterTags, chatTags, personaTags, presetTags, tags, worldBookTags } from "@orb/db";
import type { ServicesResult } from "@orb/server/entry/compose";
import type { ServerProducerRoot } from "../server.ts";

export type TagService = ServicesResult["services"]["tag"];

export type TagRow = typeof tags.$inferSelect;
export type CharacterTagRow = typeof characterTags.$inferSelect;
export type ChatTagRow = typeof chatTags.$inferSelect;
export type WorldBookTagRow = typeof worldBookTags.$inferSelect;
export type PersonaTagRow = typeof personaTags.$inferSelect;
export type PresetTagRow = typeof presetTags.$inferSelect;

type AttachParams = Parameters<TagService["attachTag"]>[0];
export type TargetlessAttachParams = Omit<AttachParams, "targetType" | "targetId">;

export interface SeededCreatedTag {
  readonly view: Awaited<ReturnType<TagService["createTag"]>>;
}

/** Run the owner's tag creation; its view is the seed's result. */
export async function seedCreatedTag(root: ServerProducerRoot, params: Parameters<TagService["createTag"]>[0]): Promise<SeededCreatedTag> {
  return { view: await root.services.tag.createTag(params) };
}

export interface SeededTagPrune {
  readonly result: Awaited<ReturnType<TagService["pruneUnusedTags"]>>;
  readonly before: readonly TagRow[];
  readonly after: readonly TagRow[];
}
