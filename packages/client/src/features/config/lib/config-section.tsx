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
import { clearActiveConfigGroup, collectionMemberSelection, getActiveConfigGroup, subscribeConfigNav, worldEntrySelectionSeam } from "#state";
import { ConfigContentSurface } from "../surfaces/config-content-surface.tsx";
import { ConfigListSurface } from "../surfaces/config-list-surface.tsx";
import { makeConfigContext } from "./config-context.tsx";
import { CONFIG_SECTION_LABEL } from "./config-copy.ts";
import { useConfigSelectionTitle } from "./config-selection-title.ts";

/**
 * The section's `SectionSelection` seam — the shell's mobile ONE-SHELL input, and its BACK stack.
 *
 * ═══ THE STACK IS THREE RUNGS DEEP NOW (#1725, owner ruling 2026-09-05; stickler F9) ══════════════════
 * It used to be two, over two facts: an open MEMBER, or an active group whose body is the screen. A
 * collection was deliberately absent from the second — `isPushingGroup` answered `false` for the whole
 * species, which is what kept a phone on the LIST after a band tap, because a collection's CONTENT was a
 * member and its members were rows in the LIST itself.
 *
 * The owner moved the members into CONTENT, so a band tap now takes over the phone like every other group's
 * does, and the predicate that encoded the old geometry SPLIT rather than flipped (`rendersOwnBody`, which
 * is the CONTENT router's question and not this one — see its note). This seam's question is simply whether
 * a group is active: after the ruling every arm of `ConfigGroupBody` occupies the screen.
 *
 * BACK POPS ONE RUNG, DEEPEST FIRST — entry, then member, then group. The ENTRY rung is world info's and it
 * is the one that has to be stated: a book's editor drills again into an entry
 * (`world-info-member-surface.tsx`), so without this rung the shell's Back popped the BOOK out from under an
 * open ENTRY and the reader landed two rungs above where they were. It subscribes as well as pops, because a
 * rung that changes without telling the shell is a Back button aimed at a stale target.
 */
function makeSelectionSeam(): SectionSelection {
  return {
    subscribe: (onStoreChange): (() => void) => {
      const unsubscribeEntry = worldEntrySelectionSeam.subscribe(onStoreChange);
      const unsubscribeMember = collectionMemberSelection.subscribe(onStoreChange);
      const unsubscribeNav = subscribeConfigNav(onStoreChange);
      return (): void => {
        unsubscribeEntry();
        unsubscribeMember();
        unsubscribeNav();
      };
    },
    // The ENTRY rung needs no clause here: an entry is only ever selected while its BOOK is the open member,
    // so `collectionMemberSelection` already answers `true` wherever the entry rung exists. Adding it would
    // be a second reader of one fact, and the two could not disagree — `clear()` below is where the rung is
    // load-bearing, because THERE the order is the whole behaviour.
    hasSelection: (): boolean => collectionMemberSelection.hasSelection() || getActiveConfigGroup() !== null,
    clear: (): void => {
      if (worldEntrySelectionSeam.hasSelection()) {
        worldEntrySelectionSeam.clear();
        return;
      }
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
    // The band carries NO aggregate primary (C-2): create lives at the COLLECTION the reader is looking at,
    // whose accessible name is that collection's own `create.label`. A band-level "New ▾" would make the
    // user pick a KIND from a menu before reaching the library they already opened. The search rides the
    // LIST body's top, not this 48px band (fork F-11).
    //
    // WHERE that create verb sits MOVED with the members (#1725): it was the LIST band's trailing `+`, and
    // it is the CONTENT library's own primary now — one home, in the pane the library occupies. The C-2
    // ruling is untouched; only the create's address changed, which is the same sentence the members'
    // address change is.
    listHeader: () => <ListPaneHeader title={CONFIG_SECTION_LABEL} />,
    selection: makeSelectionSeam(),
    useSelectionTitle: (): string | null => useConfigSelectionTitle(groups),
    content: () => <ConfigContentSurface groups={groups} />,
    // The TEACHER (S3): the pane rides the #860 bracket as tabs over `ConfigContextState` — About ·
    // Applies · Learn, fed by the focused-setting seam. The band names what the pane answers (never the
    // neutral "Details"); the member arm carries each collection's own context contract forward.
    context: makeConfigContext(groups),
  };
}
