// verb: listTagFilterVocabulary — every owned tag, projected to the four fields a character-library filter
// chip reads, ranked most-used-first. The chip rail's read, distinct from `listTagsWithUsage` (the
// management screen's five-junction rollup) by PAYLOAD, not by row set: see `TagFilterVocabularyEntry`.

import type { ListTagFilterVocabularyParams } from "../contract/params.ts";
import type { TagContext, TagService } from "../contract/service.ts";
import { listOwnedTagFilterVocabulary } from "../persistence/queries.ts";

export function createListFilterVocabulary(ctx: TagContext): TagService["listTagFilterVocabulary"] {
  return (params: ListTagFilterVocabularyParams) => listOwnedTagFilterVocabulary(ctx.db, params.principal.userId);
}
