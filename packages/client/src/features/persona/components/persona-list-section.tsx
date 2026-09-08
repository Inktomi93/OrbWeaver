// The Personas group's LIST section (config-revamp-design.md §6.8.2) — the config mount of the SAME
// `PersonaList` the rail popover and the You sheet compose (one home, three mounts — F3 is not reopened,
// and "Settings › Personas contains no personas" (side-eye 2026-08-03 P2) stays closed). ONLY this mount
// stamps the `your-personas` anchor, because an id stamped inside the shared component would be duplicated
// the moment the rail popover opens over the Config page. The list's own band IS the section's heading
// (its kicker + the two verbs), so the anchor rides a plain Stack rather than a second heading.

import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, SkeletonRows } from "#data";
import { configAnchorId } from "#state";
import { PERSONA_LIST_SUBCATEGORY } from "../lib/personas-nav.ts";
import { PersonaList } from "./persona-list.tsx";

export function PersonaListSection(): ReactElement {
  return (
    <Stack gap="row" id={configAnchorId("personas", PERSONA_LIST_SUBCATEGORY.id)}>
      {/* RESERVED (#1098). This is a CONFIG section with every later Personas section stacked under it, and
          it settles into a list of portrait rows — a one-line sentence in its place is the boot-CLS shape
          (F14): everything below jumps by the whole list when the read lands. `avatar-row` is the settled
          anatomy (portrait + name + gloss), so the wait looks like what arrives. */}
      <QueryBoundary
        fallback={<SkeletonRows count={4} shape="avatar-row" />}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="your personas" onRetry={retry} />}
        reserveKey="config.personas.list"
      >
        <PersonaList />
      </QueryBoundary>
    </Stack>
  );
}
