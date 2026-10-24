import { useSectionRegistry } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

function CharactersList(): ReactElement {
  const definition = useSectionRegistry().get("characters");
  if (definition.list === undefined) {
    throw new Error("The production characters section has no list renderer");
  }
  return <>{definition.list()}</>;
}

/** The production Characters LIST through its section-registry entry, in a viewport-high column. */
export function CharacterLibraryStory(): ReactElement {
  return (
    <CtClientProviders>
      <Stack className="h-screen">
        <CharactersList />
      </Stack>
    </CtClientProviders>
  );
}
