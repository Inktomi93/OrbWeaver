import { ListPaneHeaderHost } from "@orb/client/components";
import { presetsSection } from "@orb/client/features/preset";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** The production Presets LIST band, the CONTENT pane that holds the welcome while no preset is open, and the library below it, so
 *  the welcome stays in the first screen however long the library is. */
export function PresetImportDoorStory(): ReactElement {
  const { content, list, useListHeader } = presetsSection;
  if (typeof list !== "function" || typeof content !== "function") {
    throw new Error("The production Presets section must provide its library and content");
  }
  return (
    <CtClientProviders>
      <Container aria-label="Preset import door host" className="h-screen" role="group">
        <ListPaneHeaderHost useView={useListHeader} />
        {content()}
        {list()}
      </Container>
    </CtClientProviders>
  );
}
