// The Settings LIST — the MAP (config-revamp-design.md §3.2): four named shelves (User · App · Collections ·
// Extensions), each a stack of GROUP frames in `(order, id)` order, over the door-frozen registry. It is
// the one place the macOS negative control is refuted: the LIST ALWAYS shows where you are — the active
// group is expanded and the scroll-spy's current section lights its row.
//
// The LIST renders every registered, `when`-visible group, populated or not, so the pane's membership never
// depends on the user's data (a group that vanished when empty would read as a library that was never
// built). Row titles may still clip in this pane as POLICY (side-eye 2026-08-19 P2-1 — the collision census
// found zero indistinguishable pairs on the owner's corpus); a section whose HEADING is longer than the
// column carries a shorter `navLabel` instead, and the list CT sweeps every group for a clipped row.
//
// THE SEARCH (S2) rides the top of this scroller as a `role="search"` block, not the 48px LIST band
// (fork F-11 — the corpus omnibox precedent).

import { Container, Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useLayoutEffect, useRef } from "react";
import { useSettingsViewerView } from "#data";
import { useFocusOnMount } from "#lib";
import type { ConfigGroupDefinition, ConfigGroupId, ConfigGroupRegistry } from "#state";
import {
  CONFIG_SHELVES,
  selectConfigGroup,
  selectConfigSub,
  useActiveConfigGroup,
  useActiveConfigSub,
  useConfigSectionRegistry,
  useErroredSaveSections,
  useMobileViewport,
} from "#state";
import { ConfigListGroup } from "../components/config-list-group.tsx";
import { ConfigMobileTeaching } from "../components/config-mobile-teaching.tsx";
import { ConfigSearchInput } from "../components/config-search-input.tsx";
import { useConfigModified } from "../hooks/use-modified-sections.ts";
import { CONFIG_MODIFIED_MARKER } from "../lib/config-copy.ts";
import { CONFIG_SHELF_LABELS, configShelfLabelId } from "../lib/config-nav-model.ts";
import { useConfigSubcategoryParts } from "../lib/config-subcategories.ts";
import { orderConfigGroups } from "../lib/order-groups.ts";

// The row marker for a section whose save FAILED (SET-SEAMS §3) — a short string so it rides ListRow's
// `meta` slot (inside the row's aria-describedby), never a bare icon a screen reader can't read.
const SAVE_FAILED_MARKER = "Save failed";

export interface ConfigListSurfaceProps {
  readonly groups: ConfigGroupRegistry;
}

export function ConfigListSurface({ groups }: ConfigListSurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  // The ONE `when` projection (non-suspense — gating must never block a pane from painting), shared by the
  // group filter, the section filter and (S2) the search index.
  const viewer = useSettingsViewerView();
  const subcategoriesFor = useConfigSubcategoryParts();
  const activeGroup = useActiveConfigGroup();
  const activeSub = useActiveConfigSub();
  // The failing sections' rows (§3): the aggregate footer is read-only, so the LOCATION of a failure is
  // carried by a marker on the section's own row (and its own inline retry at its anchor).
  const sectionRegistry = useConfigSectionRegistry();
  // MODIFIED PROPAGATES UP (#1099 Errand A): one changed setting used to be announced by a 2px rail beside
  // its own row and by NOTHING at any level above it, so restoring a setting you regret started with a
  // blind hunt through nine collapsed groups. The verdict is already derived per section for `@modified`;
  // the band and the shelf simply read the same map, so the three marks cannot disagree.
  const modified = useConfigModified();
  const isGroupModified = (groupId: ConfigGroupId): boolean => (modified.subs.get(groupId)?.size ?? 0) > 0;
  const erroredSectionIds = useErroredSaveSections();
  const erroredSubIds = new Set(erroredSectionIds.filter((id) => sectionRegistry.has(id)).map((id) => sectionRegistry.get(id).nav.id));

  const visible = orderConfigGroups(groups).filter((group) => group.when?.(viewer) ?? true);
  // Landing at the TOP of a group IS landing on its first section, so the row says so immediately instead
  // of waiting for the suppressed spy to re-arm (#549).
  // The FIRST section the pane paints — canonical order, so a fold-only group lands on its first folded
  // section rather than on nothing (`primary` leads by construction; `advanced` is the fallback).
  const firstSubId = (group: ConfigGroupDefinition): string | null => {
    const parts = subcategoriesFor(group);
    return (parts.primary[0] ?? parts.advanced[0])?.id ?? null;
  };
  const onSelectGroup = (group: ConfigGroupDefinition): void => selectConfigGroup(group.id, firstSubId(group));
  const onSelectSub = (groupId: ConfigGroupId, subId: string): void => selectConfigSub(groupId, subId);
  useConfigArrivalDefault(visible, activeGroup, onSelectGroup);

  return (
    // `h-full min-h-0` on the anchor is what makes the Stack's `overflow-y-auto` real: the shell's LIST
    // region is a bounded flex box with no overflow of its own, so without a definite height here an
    // expanded 400-row group grows the pane instead of scrolling inside it.
    <Container className="h-full min-h-0">
      {/* THE ARRIVAL TARGET SAYS WHERE YOU LANDED (side-eye 2026-08-19 P3): `role="region"` is what makes
          the name computable at all (a bare `aria-label` on a generic container is ignored). The name is the
          pane's contents, not its section: the shell's LIST band already says "Settings". */}
      <Stack
        aria-label="Settings groups"
        className="relative h-full min-h-0 overflow-y-auto outline-none"
        data-slot="config-list"
        gap="section"
        ref={surfaceRef}
        role="region"
        tabIndex={-1}
      >
        {/* THE SEARCH (S2, §3.3) — one index over every group, typed `@` filters, results in place. */}
        <ConfigSearchInput groups={groups} />
        {/* THE PHONE'S ONLY TEACHING FRAME (side-eye 2026-08-19 P2) — mobile viewport + no selection only. */}
        <ConfigMobileTeaching groups={groups} />
        {CONFIG_SHELVES.map((shelf) => {
          const members = visible.filter((group) => group.shelf === shelf);
          if (members.length === 0) {
            return null;
          }
          return (
            // THE SHELVES ARE NAMED GROUPS, NOT BARE PARAGRAPHS (side-eye 2026-08-16 ARIA rider): the
            // visible kicker IS the announced name (`aria-labelledby`), so the two cannot drift.
            <Stack aria-labelledby={configShelfLabelId(shelf)} data-config-shelf={shelf} gap="field" key={shelf} role="group">
              {/* The shelf's kicker keeps being the shelf's NAME (`aria-labelledby` still points at it
                  alone); the mark is content beside it, so the group's name does not change under the
                  reader as they edit. */}
              <Row align="center" gap="tight">
                <Text id={configShelfLabelId(shelf)} voice="kicker">
                  {CONFIG_SHELF_LABELS[shelf]}
                </Text>
                {members.some((group) => isGroupModified(group.id)) ? (
                  <Text data-slot="config-shelf-modified" voice="kicker">
                    {CONFIG_MODIFIED_MARKER}
                  </Text>
                ) : null}
              </Row>
              {members.map((group) => (
                <ConfigListGroup
                  active={activeGroup === group.id}
                  activeSub={activeSub}
                  erroredSubIds={erroredSubIds}
                  group={group}
                  key={group.id}
                  onSelectGroup={onSelectGroup}
                  onSelectSub={onSelectSub}
                  saveFailedMarker={SAVE_FAILED_MARKER}
                  {...(isGroupModified(group.id) ? { modifiedMarker: CONFIG_MODIFIED_MARKER } : {})}
                  subcategories={subcategoriesFor(group)}
                />
              ))}
            </Stack>
          );
        })}
      </Stack>
    </Container>
  );
}

/**
 * THE ARRIVAL DEFAULT (#925, owner amendment 2026-09-02: *"when clicking onto config I then have to click a
 * category and then a section before I can see settings — rather than just opening by default to the FIRST
 * group and showing sections expanded if there's room"*). Config opens SHOWING SETTINGS: the first group in
 * the LIST's canonical order becomes active on arrival, so the click cost of reading a setting drops from
 * one (band click) to ZERO and the landing stops being a gauntlet in front of the surface's own contents.
 *
 * IT IS THE BAND CLICK, NOT A SECOND MECHANISM. The default calls the SAME `onSelectGroup` the band's
 * `onClick` calls — which names the group's first section so the row lights immediately (#549) and, through
 * the active-group rule, expands the band. "Sections expanded when the pane has room" is therefore already
 * true and stays the ONE rule it always was: the ACTIVE group is expanded, every sibling keeps the
 * collapsed-by-default posture of the 2026-08-02 ruling (a 400-row library expanded on arrival would bury
 * the map the LIST exists to be). That ruling survives untouched; only the number of active groups at
 * arrival changed, from zero to one.
 *
 * THREE CONDITIONS, each a real state and not defensive noise:
 *  · ONCE PER MOUNT (`landed`) — the default is an ARRIVAL fact. `clearActiveConfigGroup` (the shell's
 *    mobile Back, a rail bounce) is a door the reader walked THROUGH; a default that re-fired on the next
 *    render would slam it shut and the landing would be unreachable.
 *  · NOT WHEN SOMETHING IS ALREADY ACTIVE — a deep link (`openConfigTo`) or an open member resolves before
 *    this runs, and `activeGroup` is the EFFECTIVE derivation (a member's kind counts), so both are covered
 *    by one read.
 *  · NEVER ON A PHONE — the mobile one-shell rule turns an active PUSHING group into `hasSelection()`, so an
 *    auto-selected group would push CONTENT over the LIST and the reader would arrive inside a settings body
 *    they never chose, with the map behind a Back button. On a phone the LIST *is* the screen, which is the
 *    same posture the amendment asks for on the desktop: arrive on what you came for.
 *
 * `useLayoutEffect`, not `useEffect`: the write lands BEFORE the browser paints, so the arrival's first
 * frame is the settings body rather than one frame of the landing followed by a swap.
 */
function useConfigArrivalDefault(
  visible: readonly ConfigGroupDefinition[],
  activeGroup: ConfigGroupId | null,
  onSelectGroup: (group: ConfigGroupDefinition) => void,
): void {
  const landed = useRef(false);
  const mobile = useMobileViewport();
  useLayoutEffect((): void => {
    const first = visible[0];
    if (landed.current || mobile || activeGroup !== null || first === undefined) {
      return;
    }
    landed.current = true;
    onSelectGroup(first);
  });
}
