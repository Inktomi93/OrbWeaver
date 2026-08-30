// The Configuration rail section as ONE co-located definition (lockdown §6a) — the unified SETTINGS
// workspace (config-revamp-design.md, #866 S1): its LIST is the four-shelf map of every config GROUP with
// the settings shell's scroll-spy, its CONTENT is the active group's body or the open member's own editor,
// its CONTEXT is that collection's own arm (the teacher lands at S3).
//
// `makeConfigSection(groups)` is the FACTORY posture `makeHomeSection`/the retired `config-collections`
// factory established: the door builds the `config-groups` registry (total over `CONFIG_GROUP_IDS` by tsc)
// and hands it in, so this feature consumes every group BLIND and imports ZERO group bodies
// (`client-features-no-cross` then enforces the de-god for free).
//
// THE RAIL LABEL IS "Settings" AND THE SLOT IS THE FOOT (owner rulings F-9 + #297): the section id stays
// `config` (URL segment, persisted `activeSection`, `SECTION_IDS` untouched), the label says what the
// surface IS now that it holds the settings, and `zone: "rail.end"` puts the button where the retired
// settings-modal gear sat — derived by `assembleChrome` from this one declaration, ordered `(order, id)`
// among the foot's modal triggers and the persona widget. `icon: Settings` (the gear) is honest again: the
// config-rail-spec C-9 ban existed only to keep the workspace from being mistaken for the modal's trigger,
// and the modal is gone.
//
// `mobile: "sheet"` (F-13): reached through You, like every other authoring section — the four-tab bottom
// bar is a curation and it is already full. Whether Settings should claim a tab is a BAR re-curation, ruled
// separately; standing here on a phone borrows a bar slot like every other overflow section (#484).

import { Settings } from "@orb/ui/icons";
import { ListPaneHeader } from "#components";
import type { ConfigGroupRegistry, SectionDefinition, SectionSelection } from "#state";
import { clearActiveConfigGroup, collectionMemberSelection, getActiveConfigGroup, isPushingGroup, subscribeConfigNav } from "#state";
import { ConfigContextBody, ConfigContextHeader } from "../components/config-context-body.tsx";
import { ConfigContentSurface } from "../surfaces/config-content-surface.tsx";
import { ConfigListSurface } from "../surfaces/config-list-surface.tsx";
import { CONFIG_CONTEXT_EMPTY, CONFIG_SECTION_LABEL } from "./config-copy.ts";
import { useConfigSelectionTitle } from "./config-selection-title.ts";

/** The section's `SectionSelection` seam — the shell's mobile ONE-SHELL input, composed from the TWO facts
 *  this workspace has: an open MEMBER (the kinded selection) or an active PUSHING group (a settings group
 *  whose body is the screen — config-revamp-design.md §3.6). A collection group's activation is only its
 *  disclosure, so it never pushes; its members do. Back pops the member first, then the group. */
function makeSelectionSeam(groups: ConfigGroupRegistry): SectionSelection {
  const groupPushes = (): boolean => {
    const active = getActiveConfigGroup();
    return active !== null && isPushingGroup(groups.get(active));
  };
  return {
    subscribe: (onStoreChange): (() => void) => {
      const unsubscribeMember = collectionMemberSelection.subscribe(onStoreChange);
      const unsubscribeNav = subscribeConfigNav(onStoreChange);
      return (): void => {
        unsubscribeMember();
        unsubscribeNav();
      };
    },
    hasSelection: (): boolean => collectionMemberSelection.hasSelection() || groupPushes(),
    clear: (): void => {
      if (collectionMemberSelection.hasSelection()) {
        collectionMemberSelection.clear();
        return;
      }
      clearActiveConfigGroup();
    },
  };
}

export function makeConfigSection(groups: ConfigGroupRegistry): SectionDefinition {
  return {
    id: "config",
    rail: { label: CONFIG_SECTION_LABEL, icon: Settings, group: "authoring", mobile: "sheet", zone: "rail.end" },
    panelDefaults: { list: "docked", context: "collapsed" },
    placeholder: {
      title: CONFIG_SECTION_LABEL,
      description: "Everything you configure — your personas, appearance and chat behavior, the app's connections, and the libraries every chat is built from.",
    },
    list: () => <ConfigListSurface groups={groups} />,
    // The band carries NO aggregate primary (C-2): create lives at each COLLECTION group's band, whose
    // accessible name is that collection's own `create.label`. A band-level "New ▾" would make the user pick
    // a KIND from a menu before reaching the group they are already looking at. The search rides the LIST
    // body's top, not this 48px band (fork F-11).
    listHeader: () => <ListPaneHeader title={CONFIG_SECTION_LABEL} />,
    selection: makeSelectionSeam(groups),
    useSelectionTitle: (): string | null => useConfigSelectionTitle(groups),
    content: () => <ConfigContentSurface groups={groups} />,
    context: {
      kind: "single",
      body: () => <ConfigContextBody groups={groups} />,
      // The band names what the pane answers for the OPEN member's collection, never the neutral "Details".
      header: () => <ConfigContextHeader groups={groups} />,
      empty: CONFIG_CONTEXT_EMPTY,
    },
  };
}
