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

import { Container, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useRef } from "react";
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
} from "#state";
import { ConfigListGroup } from "../components/config-list-group.tsx";
import { ConfigMobileTeaching } from "../components/config-mobile-teaching.tsx";
import { CONFIG_SHELF_LABELS, configShelfLabelId } from "../lib/config-nav-model.ts";
import { useConfigSubcategories } from "../lib/config-subcategories.ts";
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
  const subcategoriesFor = useConfigSubcategories();
  const activeGroup = useActiveConfigGroup();
  const activeSub = useActiveConfigSub();
  // The failing sections' rows (§3): the aggregate footer is read-only, so the LOCATION of a failure is
  // carried by a marker on the section's own row (and its own inline retry at its anchor).
  const sectionRegistry = useConfigSectionRegistry();
  const erroredSectionIds = useErroredSaveSections();
  const erroredSubIds = new Set(erroredSectionIds.filter((id) => sectionRegistry.has(id)).map((id) => sectionRegistry.get(id).nav.id));

  const visible = orderConfigGroups(groups).filter((group) => group.when?.(viewer) ?? true);
  // Landing at the TOP of a group IS landing on its first section, so the row says so immediately instead
  // of waiting for the suppressed spy to re-arm (#549).
  const onSelectGroup = (group: ConfigGroupDefinition): void => selectConfigGroup(group.id, subcategoriesFor(group)[0]?.id ?? null);
  const onSelectSub = (groupId: ConfigGroupId, subId: string): void => selectConfigSub(groupId, subId);

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
        data-slot="config-roster"
        gap="section"
        ref={surfaceRef}
        role="region"
        tabIndex={-1}
      >
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
              <Text id={configShelfLabelId(shelf)} voice="kicker">
                {CONFIG_SHELF_LABELS[shelf]}
              </Text>
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
