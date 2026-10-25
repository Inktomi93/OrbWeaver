import { CtClientProviders, configSections } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** The production Looks section on a page whose ambient palette is Light, so a thumbnail that stamps nothing inherits it. */
export function LooksUnderLightStory(): ReactElement {
  return (
    <CtClientProviders>
      <div data-theme="light">
        <Container>{configSections.get("appearance-looks").body("looks-under-light")}</Container>
      </div>
    </CtClientProviders>
  );
}
