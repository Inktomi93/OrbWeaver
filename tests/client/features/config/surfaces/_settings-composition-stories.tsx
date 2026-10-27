import { CtClientProviders, CtConfigGroupBody, configSections, isolationRegistry } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** Isolate one registered production section from unrelated settings reads, retaining its actual form and provider graph. */
export function SettingsCompositionStory({ sectionId, width }: { readonly sectionId: string; readonly width: number }): ReactElement {
  const section = configSections.get(sectionId);
  const sections = isolationRegistry("configSections", "isolates a registered section's pane geometry from unrelated sections", [section]);
  return (
    <CtClientProviders>
      <Container style={{ inlineSize: width }}>
        <CtConfigGroupBody anchor={section.anchor} sections={sections} />
      </Container>
    </CtClientProviders>
  );
}
