import { openConfigTo, useSectionRegistry } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";

function AdminPane(): ReactElement {
  const definition = useSectionRegistry().get("config");
  if (typeof definition.content !== "function") {
    throw new Error("The production settings section has no content renderer");
  }
  return <>{definition.content()}</>;
}

/** The production settings content opened on Admin, with the pane's own aggregate save footer. */
export function AdminSaveFooterStory(): ReactElement {
  openConfigTo("admin");
  return (
    <CtClientProviders>
      <Container style={{ blockSize: 800, inlineSize: 900, display: "flex" }}>
        <AdminPane />
      </Container>
    </CtClientProviders>
  );
}
