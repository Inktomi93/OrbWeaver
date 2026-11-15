import { ListPaneHeaderHost } from "@orb/client/components";
import { presetsSection } from "@orb/client/features/preset";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** The production Presets LIST band, whose Import door opens the dialog, above the library it lands in. */
export function PresetImportStory(): ReactElement {
  const { list, useListHeader } = presetsSection;
  if (typeof list !== "function") {
    throw new Error("The production Presets section must provide its library");
  }
  return (
    <CtClientProviders>
      <Container aria-label="Preset import host" className="h-screen" role="group" style={{ inlineSize: 960 }}>
        <ListPaneHeaderHost useView={useListHeader} />
        {list()}
      </Container>
    </CtClientProviders>
  );
}
