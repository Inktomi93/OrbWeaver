import { CtClientProviders, CtConfigGroupBody, configSections, isolationRegistry } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** Isolate one registered production section from unrelated settings reads, retaining its actual form and provider graph. */
export function SettingsCompositionStory({
  sectionId,
  width,
  paneInset = false,
}: {
  readonly sectionId: string;
  /** Usable content width; the optional production pane inset sits outside it. */
  readonly width: number;
  readonly paneInset?: boolean;
}): ReactElement {
  const section = configSections.get(sectionId);
  const sections = isolationRegistry("configSections", "isolates a registered section's pane geometry from unrelated sections", [section]);
  return (
    <CtClientProviders>
      <Container className={paneInset ? "mx-section" : undefined} style={{ inlineSize: width }}>
        <CtConfigGroupBody anchor={section.anchor} sections={sections} />
      </Container>
    </CtClientProviders>
  );
}
