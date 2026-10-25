import { connectionsListSection } from "@orb/client/features/credentials";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** The Connections list section through its config contribution, in a viewport-high column. */
export function ConnectionsListStory(): ReactElement {
  return (
    <CtClientProviders>
      <Stack className="h-screen">
        <Container className="h-full">{connectionsListSection.body("connections-list")}</Container>
      </Stack>
    </CtClientProviders>
  );
}
