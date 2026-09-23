// The Tags config group (owner fork F-1: collections are members of the
// CLOSED `CONFIG_GROUP_IDS` tuple) — the tag library's identity (label · icon · order · the welcome blurb)
// on the group base, with its `CollectionContribution` (rows · member editor · context · create as DATA)
// riding the `collection` body arm VERBATIM. Co-located with its owner; the door's total Record names it.

import { Hash } from "@orb/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";
import type { ConfigGroupDefinition, ConfigSearchRow } from "#state";
import { tagCollection } from "./tag-collection.tsx";

import { TAG_COLLECTION_ID } from "./tags-model.ts";

/** The members as SEARCH rows (§3.3) — the same cache-first read the list already loaded, so the search
 *  costs no request. Non-suspense: an unresolved library simply contributes nothing yet. */
function useTagSearchRows(): readonly ConfigSearchRow[] {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.tag.listTagsWithUsage.queryOptions());
  return (data ?? []).map((tag) => ({ id: tag.id, label: tag.name, memberId: tag.id }));
}

export const tagsGroup: ConfigGroupDefinition = {
  id: TAG_COLLECTION_ID,
  shelf: "collections",
  label: "Tags",
  icon: Hash,
  order: 10,
  // en-US, like the rest of the chrome (#104 item 1) — this and corpus's "analyzed" were the only two
  // en-GB spellings in a user-facing string on the whole tree.
  description: "Color-coded labels for characters, chats, books, personas and presets.",
  useSearchRows: useTagSearchRows,
  body: { kind: "collection", collection: tagCollection },
};
