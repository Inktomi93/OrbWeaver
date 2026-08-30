// The Casts config group (config-revamp-design.md §3.1, owner fork F-1) — B10's saved-cast library as a
// `collection` group on the collections shelf; its `CollectionContribution` (`cast-collection.tsx`) rides
// the body arm verbatim. `order: 40` keeps it after world-info, where the door array had it.

import { Users } from "@orb/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";
import type { ConfigGroupDefinition, ConfigSearchRow } from "#state";
import { CAST_COLLECTION_ID, castCollection } from "./cast-collection.tsx";

/** The saved casts as SEARCH rows (§3.3) — the roster's own cache-first read; non-suspense on purpose. */
function useCastSearchRows(): readonly ConfigSearchRow[] {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.rosterPreset.list.queryOptions());
  return (data ?? []).map((cast) => ({ id: cast.id, label: cast.name, memberId: cast.id }));
}

export const castGroup: ConfigGroupDefinition = {
  id: CAST_COLLECTION_ID,
  shelf: "collections",
  label: "Casts",
  icon: Users,
  order: 40,
  // B10's rules rider is named here because this card is the one place a user browsing the library learns
  // what a cast IS — and applying one switches automation on in the room (side-eye 2026-08-29 P2-6).
  description: "Saved casts — a named group of characters with their seat knobs and the room's enabled rules, ready to drop into any chat.",
  useSearchRows: useCastSearchRows,
  body: { kind: "collection", collection: castCollection },
};
