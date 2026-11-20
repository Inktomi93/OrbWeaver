import { useSectionRegistry } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";

function HomeContent(): ReactElement {
  const definition = useSectionRegistry().get("home");
  if (typeof definition.content !== "function") {
    throw new Error("The production Home section must render its content");
  }
  return <>{definition.content()}</>;
}

/** The production Home section's content, in a pane of the given width, so every tile its registry raises draws as it does on Home. */
export function HomeTilesStory({ width }: { readonly width: number }): ReactElement {
  return (
    <CtClientProviders>
      <Container style={{ width, height: 900 }}>
        <HomeContent />
      </Container>
    </CtClientProviders>
  );
}
