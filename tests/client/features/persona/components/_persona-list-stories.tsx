import { personaListSection } from "@orb/client/features/persona";
import { CtClientProviders, CtConfigGroupBody, isolationRegistry } from "@orb/testkit/browser";
import type { ReactElement } from "react";

const sections = isolationRegistry("configSections", "isolates the persona list from the rest of the Personas group", [personaListSection]);

export function PersonaListStory(): ReactElement {
  return (
    <CtClientProviders>
      <CtConfigGroupBody anchor={personaListSection.anchor} sections={sections} />
    </CtClientProviders>
  );
}
