// The Configuration rail section as ONE co-located definition (lockdown §6a) — the NINTH rail entry
// (config-rail-spec.md). Its LIST is the collection ROSTER, its CONTENT is the selected member's own
// editor mounted in the pane, its CONTEXT is that collection's own arm.
//
// `makeConfigSection(collections)` is the FACTORY posture `makeHomeSection`/`makeChatsSection` established:
// the door builds the `config-collections` contributor registry and hands it in, so this feature consumes
// its collections BLIND and imports ZERO contributors (`client-features-no-cross` then enforces the
// de-god for free). The DOOR ARRAY IS THE ROSTER — moving a library between the rail and this workspace is
// one array line, with no edit to the library itself (review F-3).
//
// `icon: Package` (config-rail-spec C-9): the crate of reusable parts — the one filled silhouette among
// the rail's line drawings, and deliberately NOT `Settings`, whose gear is the settings-modal trigger.
// Ending the "which gear is which" confusion is the point of the migration.
//
// `mobile: "sheet"` (F-13): reached through You, like every other authoring section — the four-tab bottom
// bar is a curation and it is already full. Whether Configuration should claim a tab is a BAR
// re-curation, ruled separately.

import { Package } from "@orb/ui/icons";
import { ListPaneHeader } from "#components";
import type { CollectionContribution, ContributorRegistry } from "#lib";
import type { SectionDefinition } from "#state";
import { ConfigContextBody } from "../components/config-context-body";
import { ConfigContentSurface } from "../surfaces/config-content-surface";
import { ConfigRosterSurface } from "../surfaces/config-roster-surface";
import { CONFIG_CONTEXT_EMPTY } from "./config-copy";

export function makeConfigSection(collections: ContributorRegistry<CollectionContribution>): SectionDefinition {
  return {
    id: "config",
    rail: { label: "Configuration", icon: Package, group: "authoring", mobile: "sheet" },
    panelDefaults: { list: "docked", context: "collapsed" },
    placeholder: {
      title: "Configuration",
      description: "Tags, regex scripts, and the other libraries you build once and attach wherever you need them.",
    },
    list: () => <ConfigRosterSurface collections={collections} />,
    // The band carries NO aggregate primary (C-2): create lives at each GROUP header, whose accessible
    // name is that collection's own `create.label`. A band-level "New ▾" would make the user pick a KIND
    // from a menu before reaching the group they are already looking at.
    listHeader: () => <ListPaneHeader title="Configuration" />,
    content: () => <ConfigContentSurface collections={collections} />,
    context: {
      kind: "single",
      body: () => <ConfigContextBody collections={collections} />,
      empty: CONFIG_CONTEXT_EMPTY,
    },
  };
}
