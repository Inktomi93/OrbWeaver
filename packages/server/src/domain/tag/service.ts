// domain/tag — COMPOSITION ROOT. Wires the 11 verbs over the injected `TagContext`. ZERO logic: it only calls
// the verb factories and assembles the `TagService` (the `attach` factory returns the junction trio). The
// `TagContext` (db + the injected `newTagId` seam + chat's `requireParticipant` gate) is built at the entry
// composition root and passed in — tag sideways-imports nothing (domain-no-cross-feature).

import type { TagContext, TagService } from "./contract/service";
import { createAttach } from "./verbs/attach";
import { createAttachCardTagByName } from "./verbs/attach-card-tag-by-name";
import { createCreate } from "./verbs/create";
import { createGet } from "./verbs/get";
import { createList } from "./verbs/list";
import { createListWithUsage } from "./verbs/list-with-usage";
import { createPrune } from "./verbs/prune";
import { createRemove } from "./verbs/remove";
import { createSetOrder } from "./verbs/set-order";
import { createUpdate } from "./verbs/update";

export function createTagService(ctx: TagContext): TagService {
  const attach = createAttach(ctx);
  return {
    createTag: createCreate(ctx),
    getTag: createGet(ctx),
    listTags: createList(ctx),
    updateTag: createUpdate(ctx),
    removeTag: createRemove(ctx),
    listTagsWithUsage: createListWithUsage(ctx),
    pruneUnusedTags: createPrune(ctx),
    setTagOrder: createSetOrder(ctx),
    attachTag: attach.attachTag,
    detachTag: attach.detachTag,
    bulkAttachTag: attach.bulkAttachTag,

    attachCardTagByName: createAttachCardTagByName(ctx),
  };
}
