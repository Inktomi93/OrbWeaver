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
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { CollectionContribution, ContributorRegistry } from "#lib";
import { useCollectionSelection } from "#state";
import { CONFIG_CONTEXT_BAND_NEUTRAL, CONFIG_CONTEXT_EMPTY } from "../lib/config-copy";

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

/** The CONTEXT BAND's identity for this workspace (`ContextDefinition.header`, the §6b P4 slot). It names
 *  what the pane ANSWERS for the OPEN member's collection — "Where it runs" over a regex script — instead of
 *  the shell's neutral "Details", which named nothing while the arms underneath it spoke different
 *  grammars (side-eye 2026-08-03 P3).
 *
 *  IT NAMES ONLY WHAT THE PANE ANSWERS (side-eye sweep 2026-08-03). The two arms whose BODY is an
 *  `EmptyState` already print their sentence as that state's title, so a band echoing it rendered "Nothing
 *  to attach" / "Nothing selected" twice, ~78px apart — the F-12 defect (`registry-contracts.ts`: "the word
 *  'Details' twice — the band's, then the body placeholder's title") rebuilt one tier up. Those two arms
 *  fall back to {@link CONFIG_CONTEXT_BAND_NEUTRAL}, which is the frame `empty-states.html` draws for both
 *  (band "Details" over body "Nothing to attach") and is why this cannot simply render nothing: an empty
 *  band collapses to 0px and takes the pane's D66 A1 horizon with it. */
export function ConfigContextHeader({ collections }: ConfigContextBodyProps): ReactElement {
  const selection = useCollectionSelection();
  const collection = selection === null ? null : collections.get(selection.kind);
  const title = collection === null || collection.context.kind === "none" ? CONFIG_CONTEXT_BAND_NEUTRAL : collection.context.title;
  return (
    // `kicker`, not `label`: this is a BAND's name, and the LIST band 1000px to its left on the same 48px
    // horizon paints micro-caps (`ListPaneHeader`'s `micro/caps/semibold/muted`). At `label` the two bands
    // of one workspace read 10.5px-uppercase vs 13px-sentence-case — measured, and both are `.caps` in
    // `workspace.html`. `kicker` IS that treatment, in the feature-legal spelling.
    <Text as="span" voice="kicker">
      {title}
    </Text>
  );
}
