// The World Info config group (config-revamp-design.md §3.1, owner fork F-1) — the books library's
// identity on the group base, its `CollectionContribution` riding the `collection` body arm verbatim. The
// id stays `worldInfo`: it is the ONE home `WORLD_INFO_COLLECTION_ID` already exports, the persisted
// disclosure key, and the `data-collection` attribute the CTs address.

import { BookOpen } from "@orb/ui/icons";
import type { ConfigGroupDefinition } from "#state";
import { worldInfoCollection } from "./world-info-collection.tsx";
import { WORLD_INFO_COLLECTION_ID } from "./world-info-model.ts";

export const worldInfoGroup: ConfigGroupDefinition = {
  id: WORLD_INFO_COLLECTION_ID,
  shelf: "collections",
  label: "World Info",
  icon: BookOpen,
  order: 30,
  // #104 item 3 (em-dash diet): "and" is what the sentence means, so it says it.
  description: "Keyword-triggered lore your characters draw on, and a book fires where you attach it.",
  body: { kind: "collection", collection: worldInfoCollection },
};
