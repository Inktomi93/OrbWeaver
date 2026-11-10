import { connectionsRolesSection } from "@orb/client/features/credentials";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** The Model roles section through its config contribution, in a viewport-high column. */
export function ModelRolesStory(): ReactElement {
  return (
    <CtClientProviders>
      <Stack className="h-screen" scroll="y">
        <Container className="h-full">{connectionsRolesSection.body("connections-roles")}</Container>
      </Stack>
    </CtClientProviders>
  );
}
