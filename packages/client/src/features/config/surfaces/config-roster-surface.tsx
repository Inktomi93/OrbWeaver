// The Configuration LIST — the collection ROSTER (config-rail-spec.md §2): one owner-rendered group per
// registered `CollectionContribution`, in DOOR ORDER refined by the canonical `(order, id)` sort.
//
// The roster is the map of what EXISTS. It renders every registered collection, populated or not, so the
// pane's membership never depends on the user's data (a group that vanished when empty would read as a
// library that was never built).

import { Container, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useRef } from "react";
import type { CollectionContribution, ContributorRegistry } from "#lib";
import { useFocusOnMount } from "#lib";
import { CollectionGroup } from "../components/collection-group";
import { orderCollections } from "../lib/order-collections";

export interface ConfigRosterSurfaceProps {
  readonly collections: ContributorRegistry<CollectionContribution>;
}

export function ConfigRosterSurface({ collections }: ConfigRosterSurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  return (
    <Container>
      <Stack className="min-h-0 overflow-y-auto outline-none" data-slot="config-roster" gap="field" ref={surfaceRef} tabIndex={-1}>
        {orderCollections(collections).map((collection) => (
          <CollectionGroup collection={collection} key={collection.id} />
        ))}
      </Stack>
    </Container>
  );
}
