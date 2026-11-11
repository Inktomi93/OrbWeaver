import { CtClientProviders, configSections } from "@orb/testkit/browser";
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
