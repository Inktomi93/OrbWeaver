// The Personas group's ROSTER section (config-revamp-design.md §6.8.2) — the config mount of the SAME
// `PersonaRoster` the rail popover and the You sheet compose (one home, three mounts — F3 is not reopened,
// and "Settings › Personas contains no personas" (side-eye 2026-08-03 P2) stays closed). ONLY this mount
// stamps the `your-personas` anchor, because an id stamped inside the shared component would be duplicated
// the moment the rail popover opens over the Config page. The roster's own band IS the section's heading
// (its kicker + the two verbs), so the anchor rides a plain Stack rather than a second heading.

import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { QueryBoundary, QueryErrorState } from "#data";
import { configAnchorId } from "#state";
import { PERSONA_LIST_SUBCATEGORY } from "../lib/personas-nav.ts";
import { PersonaRoster } from "./persona-roster.tsx";

export function PersonaRosterSection(): ReactElement {
  return (
    <Stack gap="row" id={configAnchorId("personas", PERSONA_LIST_SUBCATEGORY.id)}>
      <QueryBoundary
        fallback={<Text voice="gloss">Loading your personas…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="your personas" onRetry={retry} />}
      >
        <PersonaRoster />
      </QueryBoundary>
    </Stack>
  );
}
