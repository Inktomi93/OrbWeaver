// The Rosters config group (owner fork F-1) — B10's saved-roster library as a
// `collection` group on the collections shelf; its `CollectionContribution` (`roster-collection.tsx`) rides
// the body arm verbatim. `order: 40` keeps it after world-info, where the door array had it.

import { Users } from "@orb/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";
import type { ConfigGroupDefinition, ConfigSearchRow } from "#state";
import { rosterCollection } from "./roster-collection.tsx";
import { ROSTER_COLLECTION_ID } from "./roster-model.ts";

/** The saved rosters as SEARCH rows (§3.3) — the roster's own cache-first read; non-suspense on purpose. */
function useRosterSearchRows(): readonly ConfigSearchRow[] {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.rosterPreset.list.queryOptions());
  return (data ?? []).map((roster) => ({ id: roster.id, label: roster.name, memberId: roster.id }));
}

export const rosterGroup: ConfigGroupDefinition = {
  id: ROSTER_COLLECTION_ID,
  shelf: "collections",
  label: "Rosters",
  icon: Users,
  order: 40,
  // B10's rules rider is named here because this card is the one place a user browsing the library learns
  // what a roster IS — and applying one switches automation on in the room (side-eye 2026-08-29 P2-6).
  description: "Saved rosters — a named group of characters with their seat knobs and the room's enabled rules, ready to drop into any chat.",
  useSearchRows: useRosterSearchRows,
  body: { kind: "collection", collection: rosterCollection },
};
