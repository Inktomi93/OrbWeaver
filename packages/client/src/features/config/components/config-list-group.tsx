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
import type { ReactElement, ReactNode, RefObject } from "react";
import { useId } from "react";
import type { ConfigGroupDefinition, ConfigGroupId, ConfigSectionPartition, ConfigSubcategory } from "#state";
import { isCollectionGroup, isPlaceholderGroup, useConfigGroupOpen } from "#state";
import { CONFIG_UNBUILT_MARKER } from "../lib/config-copy.ts";
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
  /** The SECTION's arrival focus target (#1218) — handed to the ACTIVE group only, so the reader lands on
   *  the map row that says where they are. Absent on every other group. */
  readonly bandRef?: RefObject<HTMLButtonElement | null>;
}

/** One group frame, dispatched by body KIND. */
export function ConfigListGroup(props: ConfigListGroupProps): ReactNode {
  const { group } = props;
  if (isCollectionGroup(group)) {
    return <CollectionListGroup active={props.active} group={group} {...(props.bandRef === undefined ? {} : { bandRef: props.bandRef })} />;
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
  bandRef,
}: ConfigListGroupProps): ReactElement {
  const remembered = useConfigGroupOpen(group.id);
  const open = remembered || active;
  const bodyId = useId();
  const bandId = `${bodyId}-band`;
  const foldLabelId = `${bodyId}-fold`;
  const fold = group.advancedFold;
  const hasRows = subcategories.primary.length > 0 || subcategories.advanced.length > 0;
  // FEATURE STATUS IS THE LIST'S (#925 ruling 2, 2026-09-02). The verdict is derived from the group's own
  // body arm rather than passed down like `modifiedMarker`/`saveFailedMarker`: those two are per-render
  // FACTS the surface computes (which sections differ, which saves failed), while this is the definition's
  // own shape — a build fact fixed at the door — so a prop would be plumbing with nothing to carry. The WORD
  // still comes from the host's one copy home, shared with the body this row opens.
  const unbuilt = isPlaceholderGroup(group);
  return (
    <Stack gap="tight" data-slot="config-group" data-config-group={group.id}>
      <SectionsBand
        active={active}
        bandId={bandId}
        bodyId={bodyId}
        group={group}
        hasRows={hasRows}
        {...(modifiedMarker === undefined ? {} : { modifiedMarker })}
        {...(bandRef === undefined ? {} : { bandRef })}
        onSelectGroup={onSelectGroup}
        open={open}
        unbuilt={unbuilt}
      />
      {/* THE ROWS ARE AN OWNED, NAMED GROUP (#1214-3): a bare `div` is generic and transparent, so the
          section rows announced as flat siblings of the band that owns them and the `aria-controls`
          relation below was the only thing saying otherwise. `role="group"` labelled BY THE BAND is the
          same anatomy the advanced fold already uses one level in. */}
      <div id={bodyId} hidden={!(open && hasRows)}>
        {open && hasRows ? (
          <Stack aria-labelledby={bandId} className="ps-(--spacing-section)" gap="field" role="group">
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

interface SectionsBandProps {
  readonly group: ConfigGroupDefinition;
  /** The group contributes at least one section — then the band is a disclosure GROUP rather than a leaf. */
  readonly hasRows: boolean;
  readonly open: boolean;
  readonly active: boolean;
  readonly modifiedMarker?: string;
  /** Its surface has not been built (the `{ placeholder: true }` arm) — the row says so and stays a door. */
  readonly unbuilt: boolean;
  /** The band's own id — the NAME its expanded row group points at (#1214-3). */
  readonly bandId: string;
  readonly bodyId: string;
  readonly onSelectGroup: (group: ConfigGroupDefinition) => void;
  /** Present on the ACTIVE group only — the section's arrival focus target (#1218). */
  readonly bandRef?: RefObject<HTMLButtonElement | null>;
}

/** A SETTINGS group's band. Its own component so the frame above reads as a dispatch (the collection arm's
 *  two bands are each one for the same reason), and so this file stays under the `component-size` cap the
 *  collection split was about. */
function SectionsBand({ group, hasRows, open, active, modifiedMarker, unbuilt, bandId, bodyId, onSelectGroup, bandRef }: SectionsBandProps): ReactElement {
  return (
    // A group WITH rows is a disclosure GROUP, not a nav leaf: it expands (`aria-expanded`) and its children
    // carry the one "you are here" marker. A group with no rows IS the leaf, so it keeps `aria-current`
    // itself. Two `aria-current` rows for one location was the side-eye a11y defect. The band's click
    // ACTIVATES (and therefore opens) the group — never a bare toggle — so the active group cannot be
    // collapsed from its own band: selection and disclosure are one act.
    <Button
      aria-controls={hasRows ? bodyId : undefined}
      aria-current={hasRows || !active ? undefined : "true"}
      aria-expanded={hasRows ? open : undefined}
      // THE NAME AND THE MARK, UNGLUED (#1214-1) — the collection band's landed fix, arriving here for the
      // same reason: the accessible-name computation concatenates adjacent inline nodes with NOTHING in
      // between, so a modified Appearance group announced as "AppearanceModified", one token. The separator
      // is a SPACE, never a comma or a dash: the band VISIBLY reads "Appearance Modified" and a name must
      // CONTAIN what it shows (WCAG 2.5.3 Label in Name). Stated only when there IS a mark, so an unmodified
      // band keeps its content-derived name and nothing here can drift from the visible label.
      {...(modifiedMarker === undefined ? {} : { "aria-label": `${group.label} ${modifiedMarker}` })}
      // `w-full`, NOT `flex-1` (#978 F1). This band's parent is a VERTICAL `Stack`, so `flex: 1 1 0%` put a
      // flex-BASIS of 0 on the BLOCK axis and defeated the size variant's sealed `h-control-sm`: the button
      // fell back to min-content and every settings band in the LIST rendered 16px tall — at BOTH pointer
      // classes, beside 32/44px collection siblings drawn by the same component (measured 290.2 × 16.0px;
      // Lighthouse `target-size` "safe clickable space … 20px instead of at least 24px"). The collection band
      // keeps `flex-1` because ITS parent is a `Row` — same intent, the axis is what differs. Pinned by the
      // dynamic band-height CT at both pointer classes.
      //
      // THE UNBUILT ROW IS QUIETER, AND STILL A DOOR (#925 ruling 2). Greying is the SECOND half of the
      // signal — the word below is the first, because colour alone is not a status a screen reader or a
      // low-vision reader can read. `text-muted-foreground` is the house's own recessive text token, so the
      // row recedes exactly as far as every other stood-down label and no further: it keeps its box, its
      // focus ring, its tab stop and its click, because a row nobody can open is how a finished feature gets
      // mistaken for a broken one (the #1043 class, from the other direction).
      className={`min-w-0 w-full justify-start gap-tight px-tight${unbuilt ? " text-muted-foreground" : ""}`}
      data-config-group={group.id}
      data-slot="config-band"
      id={bandId}
      {...(unbuilt ? { "data-config-unbuilt": "" } : {})}
      intent="ghost"
      onClick={(): void => onSelectGroup(group)}
      {...(bandRef === undefined ? {} : { ref: bandRef })}
      size="sm"
      type="button"
    >
      <Icon {...(hasRows ? {} : { className: "invisible" })} icon={open ? ChevronDown : ChevronRight} size="sm" />
      <Icon icon={group.icon} size="sm" />
      <Text as="span" voice="interactiveKicker" className="truncate">
        {group.label}
      </Text>
      {/* IN WORDS, INSIDE THE BAND'S OWN NAME — the same anatomy the modified marker uses below, for the same
          reason: a mark only the sighted reader gets is half a mark. This is the surface's ONLY remaining
          home for the phrase (#1043): CONTENT's status band is gone, and a library the reader has not filled
          says its own `emptyText` instead. */}
      {unbuilt ? (
        <Text as="span" data-slot="config-group-unbuilt" voice="kicker">
          {CONFIG_UNBUILT_MARKER}
        </Text>
      ) : null}
      {/* THE GROUP SAYS WHEN SOMETHING INSIDE IT CHANGED (#1099 Errand A). It rides INSIDE the band button,
          so it is part of the band's accessible name. `kicker` is a text voice, not a box: the band's height
          is untouched. */}
      {modifiedMarker === undefined ? null : (
        <Text as="span" data-slot="config-group-modified" voice="kicker">
          {modifiedMarker}
        </Text>
      )}
    </Button>
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
