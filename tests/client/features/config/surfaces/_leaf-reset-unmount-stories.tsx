import { CtClientProviders, CtConfigGroupBody, configSections, isolationRegistry } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";

/** One registered settings section the test can remove from the tree while a write is still in flight. */
export function UnmountableSectionStory({ sectionId }: { readonly sectionId: string }): ReactElement {
  const [shown, setShown] = useState(true);
  const section = configSections.get(sectionId);
  const sections = isolationRegistry("configSections", "isolates a registered section's unmount from unrelated sections", [section]);
  return (
    <CtClientProviders>
      <Button onClick={(): void => setShown(false)}>Remove section</Button>
      {shown ? (
        <Container style={{ inlineSize: 900 }}>
          <CtConfigGroupBody anchor={section.anchor} sections={sections} />
        </Container>
      ) : null}
    </CtClientProviders>
  );
}
