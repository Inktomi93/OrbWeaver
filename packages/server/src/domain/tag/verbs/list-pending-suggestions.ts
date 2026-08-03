// verb: listPendingSuggestions — the owner-scoped read of STAGED (`status:'pending'`) character-tag
// suggestions (the Accept/Reject review queue). The read half of the two-surface `character_tags.status`
// model: PD-40's distill pass + import's card-tag carry stage `pending` rows; this enumerates them (joined to
// the tag row so the review UI has name + colors — {@link TagSuggestionView}). `characterId` narrows to one
// editor's suggestions; absent = the owner's whole pending inbox. Owner-scoped via `characters.ownerId` (the
// junction carries no ownerId, D23) — a foreign character's suggestions are never returned. READ-ONLY: Accept
// is `attachTag(status:'accepted')` (flips the row), Reject is `detachTag` — no new write verb here.

import type { TagSuggestionView } from "@orb/contracts/tag";
import type { ListPendingSuggestionsParams } from "../contract/params.ts";
import type { TagContext } from "../contract/service.ts";
import { listPendingCharacterSuggestions } from "../persistence/queries.ts";

export function createListPendingSuggestions(ctx: TagContext): (params: ListPendingSuggestionsParams) => Promise<TagSuggestionView[]> {
  return ({ principal, characterId }) => listPendingCharacterSuggestions(ctx.db, principal.userId, characterId);
}
