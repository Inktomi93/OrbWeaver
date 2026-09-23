// The Personas config group (client-architecture-lockdown.md §8) — the
// persona surface RELOCATED into the unified Configuration workspace as a `sections` SKIMMER on the user
// shelf. Owned by features/persona (the M6.2 de-god move). PERSONA IS OWNER-SACRED: the surface moves and
// its FRAME conforms to the registry (three contributed sections — `persona-*-section.tsx` beside this
// file — with the editor and the pinned row as their search leaves, §6.8.2); its editing model, verbs and
// copy do not change here (S4 owns the rail slot).

import { Drama } from "@orb/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";
import type { ConfigGroupDefinition, ConfigSearchRow } from "#state";
import { PERSONA_LIST_SUBCATEGORY } from "./personas-nav.ts";

/** The persona NAMES as SEARCH rows (§3.3) — a hit lands on the list section (a persona is edited in its
 *  row, not on a member page). The list's own cache-first read; non-suspense on purpose. */
function usePersonaSearchRows(): readonly ConfigSearchRow[] {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.persona.list.queryOptions());
  return (data ?? []).map((persona) => ({ id: persona.id, label: persona.name, subId: PERSONA_LIST_SUBCATEGORY.id }));
}

export const personasGroup: ConfigGroupDefinition = {
  id: "personas",
  shelf: "user",
  label: "Personas",
  icon: Drama,
  description: "Your personas — create, edit, import and export — plus the persona-change notification.",
  order: 10,
  useSearchRows: usePersonaSearchRows,
  body: { kind: "sections" },
};
