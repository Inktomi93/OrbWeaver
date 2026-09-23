// The World Info config group (owner fork F-1) — the books library's
// identity on the group base, its `CollectionContribution` riding the `collection` body arm verbatim. The
// id stays `worldInfo`: it is the ONE home `WORLD_INFO_COLLECTION_ID` already exports, the persisted
// disclosure key, and the `data-collection` attribute the CTs address.

import { BookOpen } from "@orb/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";
import type { ConfigGroupDefinition, ConfigSearchRow } from "#state";
import { worldInfoCollection } from "./world-info-collection.tsx";

import { WORLD_INFO_COLLECTION_ID } from "./world-info-model.ts";

/** The books as SEARCH rows (§3.3) — the list's own cache-first read; non-suspense on purpose. */
function useWorldInfoSearchRows(): readonly ConfigSearchRow[] {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.worldInfo.listBooksWithUsage.queryOptions());
  return (data ?? []).map((book) => ({ id: book.id, label: book.name, memberId: book.id }));
}

export const worldInfoGroup: ConfigGroupDefinition = {
  id: WORLD_INFO_COLLECTION_ID,
  shelf: "collections",
  label: "World Info",
  icon: BookOpen,
  order: 30,
  // #104 item 3 (em-dash diet): "and" is what the sentence means, so it says it.
  description: "Keyword-triggered lore your characters draw on, and a book fires where you attach it.",
  useSearchRows: useWorldInfoSearchRows,
  body: { kind: "collection", collection: worldInfoCollection },
};
