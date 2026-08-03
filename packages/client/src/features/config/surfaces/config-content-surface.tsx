// The Configuration CONTENT — the selected member's own editor, MOUNTED in the pane (config-rail-spec.md
// §2 C-7: never a dialog; today a regex script is authored in a Dialog stacked on the settings modal).
// No selection ⇒ the designed welcome, never null.
//
// The host routes by KIND and renders whatever the owning contribution hands back — it never learns what a
// member IS. The registry is door-frozen and a selection can only be written by a rendered group, so
// `get(kind)` cannot miss.

import { Container, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useRef } from "react";
import { QueryBoundary, QueryErrorState } from "#data";
import type { CollectionContribution, ContributorRegistry } from "#lib";
import { useFocusOnMount } from "#lib";
import { useCollectionSelection } from "#state";
import { ConfigWelcome } from "../components/config-welcome";

export interface ConfigContentSurfaceProps {
  readonly collections: ContributorRegistry<CollectionContribution>;
}

export function ConfigContentSurface({ collections }: ConfigContentSurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  const selection = useCollectionSelection();
  return (
    <Container>
      <Stack className="min-h-0 outline-none" data-slot="config-content" ref={surfaceRef} tabIndex={-1}>
        {selection === null ? (
          <ConfigWelcome collections={collections} />
        ) : (
          <QueryBoundary
            fallback={<Text voice="gloss">Loading…</Text>}
            renderError={(_error, retry): ReactElement => <QueryErrorState label={collections.get(selection.kind).label.toLowerCase()} onRetry={retry} />}
          >
            {collections.get(selection.kind).detail({ memberId: selection.memberId })}
          </QueryBoundary>
        )}
      </Stack>
    </Container>
  );
}
