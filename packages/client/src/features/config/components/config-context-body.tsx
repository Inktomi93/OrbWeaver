// The Configuration CONTEXT body (`ContextDefinition` `kind:"single"` — lockdown §6b): the selected
// member's own context arm, routed by kind. Reads its OWN selection so the `single` arm's `body` stays a
// zero-arg render (S = void: config shares no context-state projection).
//
// THREE ARMS, THREE DIFFERENT TRUTHS:
//  · nothing selected → the section's own no-selection copy (`context.empty`, side-eye F-12);
//  · a member of a collection that declares `context: {kind:"none"}` → THAT COLLECTION's copy. A generic
//    "nothing selected" here would be a lie — something IS selected, this library just has nothing to
//    attach — which is why the copy is a contract field and not the host's.
//  · otherwise → the contribution's own body.

import { EmptyState } from "@orb/ui/empty-state";
import { Anchor, Icon } from "@orb/ui/icons";
import type { ReactElement } from "react";
import type { CollectionContribution, ContributorRegistry } from "#lib";
import { useCollectionSelection } from "#state";
import { CONFIG_CONTEXT_EMPTY } from "../lib/config-copy";

export interface ConfigContextBodyProps {
  readonly collections: ContributorRegistry<CollectionContribution>;
}

export function ConfigContextBody({ collections }: ConfigContextBodyProps): ReactElement {
  const selection = useCollectionSelection();
  if (selection === null) {
    return <EmptyState description={CONFIG_CONTEXT_EMPTY.description} icon={<Icon icon={Anchor} size="lg" />} title={CONFIG_CONTEXT_EMPTY.title} />;
  }
  const collection = collections.get(selection.kind);
  if (collection.context.kind === "none") {
    return <EmptyState description={collection.context.description} icon={<Icon icon={collection.icon} size="lg" />} title={collection.context.title} />;
  }
  return <>{collection.context.render({ memberId: selection.memberId })}</>;
}
