import { personaListSection } from "@orb/client/features/persona";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";

const { teach } = personaListSection.nav;

/** The Personas section's own Learn body, exactly as the teacher pane's Learn tab renders it. */
export function PersonaMarksLearnStory(): ReactElement {
  return <CtClientProviders>{teach !== undefined && "more" in teach ? teach.more() : null}</CtClientProviders>;
}
