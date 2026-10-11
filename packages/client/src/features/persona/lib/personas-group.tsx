// The Personas config group — the MANAGE surface for personas, a `sections` skimmer on the user shelf. Its
// sections are contributed beside this file (`persona-*-section.tsx`); playing a persona lives in the switcher.

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
  description:
    "Your personas: who you are in the story. Make and edit them here, mark one as your default with the crown, and choose whether the app tells you when a chat changes who you're playing. Switching happens in the persona switcher behind your avatar.",
  order: 10,
  useSearchRows: usePersonaSearchRows,
  body: { kind: "sections" },
};
