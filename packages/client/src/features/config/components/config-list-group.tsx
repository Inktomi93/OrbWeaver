// ONE config GROUP in the Settings LIST — the HOST half of the seam (config-rail-spec.md §2 C-4/C-6,
// config-revamp-design.md §3.2): the props contract, the KIND dispatch, and the SETTINGS arm — a group's
// SUBCATEGORY rows (the retired settings nav column's rows, `selected` = the scroll-spy's current section).
// `ConfigListGroup` dispatches on `body.kind`, which is a BUILD fact fixed at the door, so each arm's hooks
// run unconditionally in a fixed position. The COLLECTION arm — the band's count + trailing verbs and the
// contribution's own member rows — is `config-list-collection-group.tsx`, split out when this file crossed
// the `component-size` cap; the two arms are two species and only the dispatch is shared.
//
// GROUPS START COLLAPSED (owner ruling 2026-08-02, superseding the mocks' always-expanded drawing): a real
// library is not a glance — the owner's tag library is ~400 rows — so an expanded group would bury every
// sibling below its scroll and the LIST would stop being the map of what EXISTS. The band is the map;
// expanding is one click, and the expanded set is remembered per device. ONE amendment for the unified
// surface: the ACTIVE group is always expanded and its band cannot collapse it — selection and disclosure
// are one act (the `selectCollectionMember` rule, now for every kind).
//
// A SETTINGS GROUP'S ROWS ARE THE PANE'S SEQUENCE, FOLD AND ALL (#978 F4, superseding the earlier "the
// fold is a CONTENT posture, LIST rows are untouched" clause on `ConfigGroupBase.advancedFold`). The rows
// arrive already partitioned by `ConfigSectionPartition` — the ONE order contract, shared with CONTENT —
// and the advanced cohort is drawn LAST, inside a nested `role="group"` labelled by the disclosure's own
// name. A map that shows a section where the pane does not paint it is worse than a map that admits the
// section is behind a door.
//
// THE BAND'S CONTROLS ARE SIBLINGS, never nested — a button inside the disclosure button would be
// unclickable-by-spec and unreadable to a screen reader. It bites hardest on the collection band, which is
// the one with trailing verbs, so the rule and its ordering live at that band (`config-list-collection-group.tsx`).

import { Button } from "@orb/ui/button";
import { ChevronDown, ChevronRight, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useId } from "react";
import type { ConfigGroupDefinition, ConfigGroupId, ConfigSectionPartition, ConfigSubcategory } from "#state";
import { isCollectionGroup, useConfigGroupOpen } from "#state";
import { CollectionListGroup } from "./config-list-collection-group.tsx";

export interface ConfigListGroupProps {
  readonly group: ConfigGroupDefinition;
  /** The group's rows: the sections contributed at its anchor (`useConfigSubcategoryParts`, §6.8 — nothing
   *  else), in the ONE canonical order and still SPLIT by fold membership, so the band can say where the
   *  advanced cohort lives instead of appending it silently. Both sides empty for a collection group (its
   *  rows are the owner's). */
  readonly subcategories: ConfigSectionPartition<ConfigSubcategory>;
  /** The EFFECTIVE active group is this one — its rows show, its band cannot collapse. */
  readonly active: boolean;
  /** The scroll-spy's current subcategory inside the active group. */
  readonly activeSub: string | null;
  /** Subcategory ids whose section failed to save — the row wears the marker (SET-SEAMS §3). */
  readonly erroredSubIds: ReadonlySet<string>;
  readonly saveFailedMarker: string;
  /** Present when ANY section inside this group differs from its default — the band says so (#1099 Errand
   *  A). The host passes the WORD, exactly like `saveFailedMarker`, so the band owns no copy. */
  readonly modifiedMarker?: string;
  readonly onSelectGroup: (group: ConfigGroupDefinition) => void;
  readonly onSelectSub: (groupId: ConfigGroupId, subId: string) => void;
}

/** One group frame, dispatched by body KIND. */
export function ConfigListGroup(props: ConfigListGroupProps): ReactNode {
  const { group } = props;
  if (isCollectionGroup(group)) {
    return <CollectionListGroup active={props.active} group={group} />;
  }
  return <SectionsListGroup {...props} />;
}

// ── A SETTINGS group: the band is a disclosure whose body is the subcategory rows ────────────────────────

function SectionsListGroup({
  group,
  subcategories,
  active,
  activeSub,
  erroredSubIds,
  saveFailedMarker,
  modifiedMarker,
  onSelectGroup,
  onSelectSub,
}: ConfigListGroupProps): ReactElement {
  const remembered = useConfigGroupOpen(group.id);
  const open = remembered || active;
  const bodyId = useId();
  const foldLabelId = `${bodyId}-fold`;
  const fold = group.advancedFold;
  const hasRows = subcategories.primary.length > 0 || subcategories.advanced.length > 0;
  return (
    <Stack gap="tight" data-slot="config-group" data-config-group={group.id}>
      {/* A group WITH rows is a disclosure GROUP, not a nav leaf: it expands (`aria-expanded`) and its
          children carry the one "you are here" marker. A group with no rows IS the leaf, so it keeps
          `aria-current` itself. Two `aria-current` rows for one location was the side-eye a11y defect.
          The band's click ACTIVATES (and therefore opens) the group — never a bare toggle — so the active
          group cannot be collapsed from its own band: selection and disclosure are one act. */}
      <Button
        aria-controls={hasRows ? bodyId : undefined}
        aria-current={hasRows || !active ? undefined : "true"}
        aria-expanded={hasRows ? open : undefined}
        // `w-full`, NOT `flex-1` (#978 F1). This band's parent is a VERTICAL `Stack`, so `flex: 1 1 0%`
        // put a flex-BASIS of 0 on the BLOCK axis and defeated the size variant's sealed `h-control-sm`:
        // the button fell back to min-content and every settings band in the LIST rendered 16px tall — at
        // BOTH pointer classes, beside 32/44px collection siblings drawn by the same component (measured
        // 290.2 × 16.0px; Lighthouse `target-size` "safe clickable space … 20px instead of at least 24px").
        // The collection band below keeps `flex-1` because ITS parent is a `Row` — same intent, the axis is
        // what differs. Pinned by the dynamic band-height CT at both pointer classes.
        className="min-w-0 w-full justify-start gap-tight px-tight"
        data-slot="config-band"
        data-config-group={group.id}
        intent="ghost"
        onClick={(): void => onSelectGroup(group)}
        size="sm"
        type="button"
      >
        <Icon {...(hasRows ? {} : { className: "invisible" })} icon={open ? ChevronDown : ChevronRight} size="sm" />
        <Icon icon={group.icon} size="sm" />
        <Text as="span" voice="interactiveKicker" className="truncate">
          {group.label}
        </Text>
        {/* THE GROUP SAYS WHEN SOMETHING INSIDE IT CHANGED (#1099 Errand A). It rides INSIDE the band
            button, so it is part of the band's accessible name — a mark only the sighted reader gets is
            half a mark. `kicker` is a text voice, not a box: the band's height is untouched. */}
        {modifiedMarker === undefined ? null : (
          <Text as="span" data-slot="config-group-modified" voice="kicker">
            {modifiedMarker}
          </Text>
        )}
      </Button>
      <div id={bodyId} hidden={!(open && hasRows)}>
        {open && hasRows ? (
          <Stack className="ps-(--spacing-section)" gap="field">
            {subcategories.primary.map((sub) => (
              <SubcategoryRow
                key={sub.id}
                active={active}
                activeSub={activeSub}
                erroredSubIds={erroredSubIds}
                groupId={group.id}
                onSelectSub={onSelectSub}
                saveFailedMarker={saveFailedMarker}
                sub={sub}
              />
            ))}
            {/* THE MAP SAYS WHERE THE FOLD IS (#978 F4). The advanced cohort used to be interleaved into
                the LIST at its raw declaration position while CONTENT painted it last, inside a collapsed
                disclosure — so the map advertised "Sizing & motion" fourth over a pane that renders it
                ninth, behind a door the map never mentioned, and a cold reader could not tell that three
                of the nine sections were not on screen. It is now the LAST rows (the partition owns that
                order) inside a NESTED GROUP wearing the disclosure's own label, which is both the visible
                answer and the announced one. A group with no declared fold has nothing to name, so its
                advanced rows simply ride in flow at the end — exactly where CONTENT paints them. */}
            {fold === undefined || subcategories.advanced.length === 0 ? (
              subcategories.advanced.map((sub) => (
                <SubcategoryRow
                  key={sub.id}
                  active={active}
                  activeSub={activeSub}
                  erroredSubIds={erroredSubIds}
                  groupId={group.id}
                  onSelectSub={onSelectSub}
                  saveFailedMarker={saveFailedMarker}
                  sub={sub}
                />
              ))
            ) : (
              <Stack aria-labelledby={foldLabelId} data-slot="config-fold-rows" gap="field" role="group">
                {/* The visible kicker IS the announced name (`aria-labelledby`), the shelf-label idiom —
                    so the two cannot drift, and the surface spends no sixth voice on it. */}
                <Text id={foldLabelId} voice="kicker">
                  {fold.label}
                </Text>
                <Stack className="ps-(--spacing-block)" gap="field">
                  {subcategories.advanced.map((sub) => (
                    <SubcategoryRow
                      key={sub.id}
                      active={active}
                      activeSub={activeSub}
                      erroredSubIds={erroredSubIds}
                      groupId={group.id}
                      onSelectSub={onSelectSub}
                      saveFailedMarker={saveFailedMarker}
                      sub={sub}
                    />
                  ))}
                </Stack>
              </Stack>
            )}
          </Stack>
        ) : null}
      </div>
    </Stack>
  );
}

interface SubcategoryRowProps {
  readonly sub: ConfigSubcategory;
  readonly groupId: ConfigGroupId;
  readonly active: boolean;
  readonly activeSub: string | null;
  readonly erroredSubIds: ReadonlySet<string>;
  readonly saveFailedMarker: string;
  readonly onSelectSub: (groupId: ConfigGroupId, subId: string) => void;
}

/** ONE section row. The row renders `navLabel` when the section declares one — a name too long for the LIST
 *  column is ABBREVIATED here, never renamed at its heading. The full `label` rides `fullTitle` so hovering
 *  recovers it. Extracted so the plain cohort and the fold's cohort are provably the SAME row (they are
 *  drawn in two places now; a copy would let the fold's rows drift into a second grammar). */
function SubcategoryRow({ sub, groupId, active, activeSub, erroredSubIds, saveFailedMarker, onSelectSub }: SubcategoryRowProps): ReactElement {
  return (
    <ListRow
      clickable={true}
      {...(erroredSubIds.has(sub.id) ? { meta: saveFailedMarker } : {})}
      fullTitle={sub.label}
      onClick={(): void => onSelectSub(groupId, sub.id)}
      selected={active && activeSub === sub.id}
      title={sub.navLabel ?? sub.label}
    />
  );
}
