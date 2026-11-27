import { CtClientProviders, CtConfigGroupBody, configSections, isolationRegistry } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** The Distribute section in its real composition: the admin's published list, with the section's own pane boundary. */
export function DistributeSectionStory(): ReactElement {
  const section = configSections.get("plugin-distribute");
  const sections = isolationRegistry("configSections", "isolates the distribute list from unrelated plugin sections", [section]);
  return (
    <CtClientProviders>
      <Container role="group" aria-label="Distribute host">
        <CtConfigGroupBody anchor={section.anchor} sections={sections} />
      </Container>
    </CtClientProviders>
  );
}
