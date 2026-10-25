import { requestRefineryLandingFocus, useSectionRegistry } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";

function Landing(): ReactElement {
  const content = useSectionRegistry().get("refinery").content;
  if (typeof content !== "function") {
    throw new Error("Refinery has no content contribution");
  }
  return (
    <Container>
      <Button onClick={requestRefineryLandingFocus}>Focus landing picker</Button>
      {content()}
    </Container>
  );
}

export function RefineryLandingFocusStory(): ReactElement {
  return (
    <CtClientProviders>
      <Landing />
    </CtClientProviders>
  );
}
