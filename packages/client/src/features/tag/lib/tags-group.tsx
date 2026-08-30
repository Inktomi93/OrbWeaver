// The Tags config group (config-revamp-design.md §3.1, owner fork F-1: collections are members of the
// CLOSED `CONFIG_GROUP_IDS` tuple) — the tag library's identity (label · icon · order · the welcome blurb)
// on the group base, with its `CollectionContribution` (rows · member editor · context · create as DATA)
// riding the `collection` body arm VERBATIM. Co-located with its owner; the door's total Record names it.

import { Hash } from "@orb/ui/icons";
import type { ConfigGroupDefinition } from "#state";
import { tagCollection } from "./tag-collection.tsx";
import { TAG_COLLECTION_ID } from "./tags-model.ts";

export const tagsGroup: ConfigGroupDefinition = {
  id: TAG_COLLECTION_ID,
  shelf: "collections",
  label: "Tags",
  icon: Hash,
  order: 10,
  // en-US, like the rest of the chrome (#104 item 1) — this and corpus's "analyzed" were the only two
  // en-GB spellings in a user-facing string on the whole tree.
  description: "Color-coded labels for characters, chats, books, personas and presets.",
  body: { kind: "collection", collection: tagCollection },
};
