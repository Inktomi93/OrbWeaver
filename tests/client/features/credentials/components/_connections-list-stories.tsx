import { connectionsListSection } from "@orb/client/features/credentials";
import { pushRecentModel } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useEffect } from "react";

function RecentModels({ ids, source }: { readonly ids: readonly string[]; readonly source: string }): null {
  useEffect(() => {
    for (const id of ids) {
      pushRecentModel(source, id);
    }
  }, [ids, source]);
  return null;
}

/** The Connections list section through its config contribution, in a viewport-high column. */
export function ConnectionsListStory({ recent }: { readonly recent?: { readonly ids: readonly string[]; readonly source: string } }): ReactElement {
  return (
    <CtClientProviders>
      {recent === undefined ? null : <RecentModels {...recent} />}
      <Stack className="h-screen">
        <Container className="h-full">{connectionsListSection.body("connections-list")}</Container>
      </Stack>
    </CtClientProviders>
  );
}
