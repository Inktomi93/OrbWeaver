import { CtClientProviders, CtUserBus, configSections } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** The production Looks section, where a theme file is imported and the settings it left behind are reported. */
export function LooksImportStory(): ReactElement {
  return (
    <CtClientProviders>
      <Container>{configSections.get("appearance-looks").body("looks-import")}</Container>
    </CtClientProviders>
  );
}

/** The Looks section with the socket and the user bus the app root wires beside it, so a server event reaches the themes it changes. */
export function LooksBusStory(): ReactElement {
  return (
    <CtClientProviders>
      <CtUserBus>
        <Container>{configSections.get("appearance-looks").body("looks-import")}</Container>
      </CtUserBus>
    </CtClientProviders>
  );
}
