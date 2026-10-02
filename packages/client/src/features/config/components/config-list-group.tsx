// ConfigListGroup owns the kind dispatch, props contract, and settings subcategory rows. body.kind is
// fixed at the door so each arm's hooks have an unconditional position. The collection arm lives in
// config-list-collection-group.tsx; only the dispatch is shared.
//
// Groups start collapsed to keep the list a map rather than burying siblings under one long library (owner
// ruling 2026-08-02). Expanded groups are remembered per device. The active group is always expanded and
// cannot collapse: selection and disclosure are one act.
//
// Settings rows share ConfigSectionPartition with Content; the advanced cohort comes last in a nested
// named group (#978). Band controls are siblings, never buttons inside the disclosure button.
//
// The pane's voice budget (#1169/#1714) is kicker for a non-control region name, interactiveKicker for a
// controlling region name, datum for a mono count, and gloss for prose. Names are the groups' aria-
// labelledby targets. State is a Badge, never a second name in the same voice. This covers collection
// member rows as well as bands.
//
// The #1099 band-height ruling protects no growth when modified state changes, not a preference for text
// over a box. size=sm fixes the band height at h-control-sm for both pointer classes; an internal Badge
// cannot move it. The band-height CT retains that contract.

import { Badge } from "@orb/ui/badge";
import { Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode, RefObject } from "react";
import { useId } from "react";
import type { BandProps } from "#components";
import { Band } from "#components";
import type { ConfigGroupDefinition, ConfigGroupId, ConfigSectionPartition, ConfigSubcategory } from "#state";
import { isCollectionGroup, isPlaceholderGroup, useConfigGroupOpen } from "#state";
import { CONFIG_UNBUILT_MARKER } from "../lib/config-copy.ts";
import { CollectionListGroup } from "./config-list-collection-group.tsx";
import { ConfigModifiedMark } from "./config-modified-mark.tsx";

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
  /** Subcategory ids inside THIS group whose section differs from its default — the `useConfigModified`
   *  SECTION grain, which the surface already derives for `@modified` and for the two marks above this row
   *  (#1099 Errand A). The row is the level that NAMES the location, and it was the one level that stayed
   *  silent: the shelf said a group inside it changed, the band said which group, and then the reader
   *  opened nine section rows that all looked identical. Empty for a group with nothing modified. */
  readonly modifiedSubIds: ReadonlySet<string>;
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
  modifiedSubIds,
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
                modifiedMarker={modifiedMarker}
                modifiedSubIds={modifiedSubIds}
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
                  modifiedMarker={modifiedMarker}
                  modifiedSubIds={modifiedSubIds}
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
                      modifiedMarker={modifiedMarker}
                      modifiedSubIds={modifiedSubIds}
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
  // THE UNBUILT ARM NEEDS NO STATED NAME — MEASURED, NOT ASSUMED (#1169). The obvious reading of #1214-1
  // is that the unbuilt marker is the same welding defect as the modified one and owes the same
  // `aria-label`. It is not: run red-first against the unmodified source, a deferred band already
  // announced "Connections Not built yet" as two words. The modified arm needed the stated name because
  // its marker was a `Text as="span"` — a genuinely INLINE box, which the accessible-name computation
  // concatenates with nothing between; a `Badge` is `inline-flex`, so the computation inserts the space
  // itself. Nothing is stated here, and the placeholder CT pins the two-word name so the next edit to this
  // marker's box cannot silently weld it.
  //
  // A group with NO rows is a nav LEAF, so its gutter is `reserved` and it states no `aria-expanded` — the
  // two halves are one statement (`BandProps.chevron`'s doc). Two steps rather than a nested ternary.
  const disclosed: BandProps["chevron"] = open ? "open" : "closed";
  const chevron: BandProps["chevron"] = hasRows ? disclosed : "reserved";
  return (
    // A group WITH rows is a disclosure GROUP, not a nav leaf: it expands (`aria-expanded`) and its children
    // carry the one "you are here" marker. A group with no rows IS the leaf, so it keeps `aria-current`
    // itself. Two `aria-current` rows for one location was the side-eye a11y defect. The band's click
    // ACTIVATES (and therefore opens) the group — never a bare toggle — so the active group cannot be
    // collapsed from its own band: selection and disclosure are one act.
    <Band
      aria-controls={hasRows ? bodyId : undefined}
      aria-current={hasRows || !active ? undefined : "true"}
      aria-expanded={hasRows ? open : undefined}
      // THE NAME AND THE MARK, UNGLUED (#1214-1) — the collection band's landed fix, arriving here for the
      // same reason: the accessible-name computation concatenates adjacent inline nodes with NOTHING in
      // between, so a modified Appearance group announced as "AppearanceModified", one token. The separator
      // is a SPACE, never a comma or a dash: the band VISIBLY reads "Appearance Modified" and a name must
      // CONTAIN what it shows (WCAG 2.5.3 Label in Name). Stated only when there IS a mark, so an unmodified
      // band keeps its content-derived name and nothing here can drift from the visible label. The UNBUILT
      // marker needs no such statement — see the measured note above the return.
      {...(modifiedMarker === undefined ? {} : { "aria-label": `${group.label} ${modifiedMarker}` })}
      // THE UNBUILT ROW IS QUIETER, AND STILL A DOOR (#925 ruling 2). Greying is the SECOND half of the
      // signal — the word below is the first, because colour alone is not a status a screen reader or a
      // low-vision reader can read. `text-muted-foreground` is the house's own recessive text token, so the
      // row recedes exactly as far as every other stood-down label and no further: it keeps its box, its
      // focus ring, its tab stop and its click, because a row nobody can open is how a finished feature gets
      // mistaken for a broken one (the #1043 class, from the other direction). The CHASSIS classes that used
      // to be spelled here — `w-full`, NOT `flex-1` (#978 F1) among them — are `Band`'s now; that fix's one
      // home moved with the anatomy (#1723), which is what stops the next copy from missing it.
      {...(unbuilt ? { className: "text-muted-foreground" } : {})}
      chevron={chevron}
      data-config-group={group.id}
      data-slot="config-band"
      icon={group.icon}
      id={bandId}
      {...(unbuilt ? { "data-config-unbuilt": "" } : {})}
      label={group.label}
      // IN WORDS, INSIDE THE BAND'S OWN NAME — a mark only the sighted reader gets is half a mark. The
      // unbuilt phrase's ONLY remaining home is here (#1043): CONTENT's status band is gone, and a library
      // the reader has not filled says its own `emptyText` instead. The modified mark says when something
      // inside the group changed (#1099 Errand A). Both ride INSIDE the control, so both are part of its name.
      marks={
        <>
          {unbuilt ? (
            <Badge data-slot="config-group-unbuilt" intent="neutral" size="sm" tone="soft">
              {CONFIG_UNBUILT_MARKER}
            </Badge>
          ) : null}
          {modifiedMarker === undefined ? null : <ConfigModifiedMark label={modifiedMarker} slot="config-group-modified" />}
        </>
      }
      onClick={(): void => onSelectGroup(group)}
      {...(bandRef === undefined ? {} : { ref: bandRef })}
    />
  );
}

interface SubcategoryRowProps {
  readonly sub: ConfigSubcategory;
  readonly groupId: ConfigGroupId;
  readonly active: boolean;
  readonly activeSub: string | null;
  readonly erroredSubIds: ReadonlySet<string>;
  readonly saveFailedMarker: string;
  readonly modifiedSubIds: ReadonlySet<string>;
  /** The host's ONE word for "differs from its default", present exactly while this GROUP is modified —
   *  which is exactly when one of these rows is. `string | undefined` rather than an optional prop: the
   *  caller has a `string | undefined` in hand and an internal row is not worth a conditional spread. */
  readonly modifiedMarker: string | undefined;
  readonly onSelectSub: (groupId: ConfigGroupId, subId: string) => void;
}

/** Section state stays in the row description; a failed save takes precedence over its modified mark. */
function SubcategoryRow({
  sub,
  groupId,
  active,
  activeSub,
  erroredSubIds,
  saveFailedMarker,
  modifiedSubIds,
  modifiedMarker,
  onSelectSub,
}: SubcategoryRowProps): ReactElement {
  const modified = modifiedSubIds.has(sub.id) ? modifiedMarker : undefined;
  const failed = erroredSubIds.has(sub.id);
  return (
    <ListRow
      clickable={true}
      {...(failed ? { meta: saveFailedMarker } : {})}
      {...(!failed && modified !== undefined ? { markers: <ConfigModifiedMark label={modified} slot="config-section-modified" /> } : {})}
      fullTitle={sub.label}
      onClick={(): void => onSelectSub(groupId, sub.id)}
      selected={active && activeSub === sub.id}
      title={sub.navLabel ?? sub.label}
    />
  );
}
