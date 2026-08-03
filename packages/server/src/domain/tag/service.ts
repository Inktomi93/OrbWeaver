// domain/tag — COMPOSITION ROOT. Wires the 11 verbs over the injected `TagContext`. ZERO logic: it only calls
// the verb factories and assembles the `TagService` (the `attach` factory returns the junction trio). The
// `TagContext` (db + the injected `newTagId` seam + chat's `requireParticipant` gate) is built at the entry
// composition root and passed in — tag sideways-imports nothing (domain-no-cross-feature).

import type { TagContext, TagService } from "./contract/service.ts";
import { createAttach } from "./verbs/attach.ts";
import { createAttachCardTagByName } from "./verbs/attach-card-tag-by-name.ts";
import { createCreate } from "./verbs/create.ts";
import { createDetachCardTagByName } from "./verbs/detach-card-tag-by-name.ts";
import { createList } from "./verbs/list.ts";
import { createListPendingSuggestions } from "./verbs/list-pending-suggestions.ts";
import { createListWithUsage } from "./verbs/list-with-usage.ts";
import { createMerge } from "./verbs/merge.ts";
import { createPrune } from "./verbs/prune.ts";
import { createRemove } from "./verbs/remove.ts";
import { createSetOrder } from "./verbs/set-order.ts";
import { createUpdate } from "./verbs/update.ts";

export function createTagService(ctx: TagContext): TagService {
  const attach = createAttach(ctx);
  return {
    createTag: createCreate(ctx),
    listTags: createList(ctx),
    updateTag: createUpdate(ctx),
    removeTag: createRemove(ctx),
    mergeTags: createMerge(ctx),
    listTagsWithUsage: createListWithUsage(ctx),
    listPendingSuggestions: createListPendingSuggestions(ctx),
    pruneUnusedTags: createPrune(ctx),
    setTagOrder: createSetOrder(ctx),
    attachTag: attach.attachTag,
    detachTag: attach.detachTag,
    bulkAttachTag: attach.bulkAttachTag,
    attachCardTagByName: createAttachCardTagByName(ctx),
    detachCardTagByName: createDetachCardTagByName(ctx),
  };
}
