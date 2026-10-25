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

export function HomeGridRefStory({ width }: { readonly width: number }): ReactElement {
  return (
    <CtClientProviders>
      <Container style={{ width, height: 900 }}>
        <HomeContent />
      </Container>
    </CtClientProviders>
  );
}
