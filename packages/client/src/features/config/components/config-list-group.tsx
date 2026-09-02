// ONE config GROUP in the Settings LIST — the HOST half of the seam (config-rail-spec.md §2 C-4/C-6,
// config-revamp-design.md §3.2): the band (disclosure · icon · kicker · a collection's count + verbs), and
// the body by KIND — a settings group's SUBCATEGORY rows (the retired settings nav column's rows, `selected`
// = the scroll-spy's current section), or a collection's OWNER-rendered member rows under the host's
// count-driven filter. `ConfigListGroup` dispatches on `body.kind`, which is a BUILD fact fixed at the
// door, so each arm's hooks run unconditionally in a fixed position.
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
// THE BAND'S CONTROLS ARE SIBLINGS, never nested: the disclosure is a button spanning the identity cluster,
// and a collection's trailing verbs (the optional IMPORT trigger, then the create `+`) sit BESIDE it — a
// button inside the disclosure button would be unclickable-by-spec (nested interactives) and unreadable to
// a screen reader. IMPORT leads CREATE because create is the primary and a primary sits last, hard against
// the trailing edge (the world-info list band's landed order, re-homed).

import { Button } from "@orb/ui/button";
import { FileTrigger } from "@orb/ui/file-trigger";
import { ChevronDown, ChevronRight, Icon, ListChecks, Plus, Search, Upload } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useId, useState } from "react";
import { QueryBoundary, QueryErrorState } from "#data";
import type { CollectionContribution } from "#lib";
import { COLLECTION_LARGE_GROUP } from "#lib";
import type { CollectionGroupDefinition, ConfigGroupDefinition, ConfigGroupId, ConfigSectionPartition, ConfigSubcategory } from "#state";
import { isCollectionGroup, selectCollectionMemberFromList, toggleConfigGroup, useCollectionSelection, useConfigGroupOpen } from "#state";

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
  readonly onSelectGroup: (group: ConfigGroupDefinition) => void;
  readonly onSelectSub: (groupId: ConfigGroupId, subId: string) => void;
}

/** One group frame, dispatched by body KIND. */
export function ConfigListGroup(props: ConfigListGroupProps): ReactNode {
  const { group } = props;
  if (isCollectionGroup(group)) {
    return <CollectionListGroup group={group} />;
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

// ── A COLLECTION group: the band + the owner's rows (config-rail-spec.md C-4, verbatim) ─────────────────

interface CollectionListGroupProps {
  readonly group: CollectionGroupDefinition;
}

export function CollectionListGroup({ group }: CollectionListGroupProps): ReactNode {
  const collection = group.body.collection;
  // Every hook runs UNCONDITIONALLY over the door-frozen registry (the `useVisible` contract) — the
  // visibility verdict gates the RENDER, never the hook call.
  const visible = collection.useVisible?.() ?? true;
  const count = collection.useCount?.();
  const create = collection.create.useRun();
  const open = useConfigGroupOpen(group.id);
  const selection = useCollectionSelection();
  const [filter, setFilter] = useState("");
  const bodyId = useId();

  if (!visible) {
    return null;
  }

  const isEmpty = count === 0;
  return (
    <Stack gap="tight" data-slot="config-group" data-collection={group.id} data-config-group={group.id}>
      {/* The band carries its own `data-collection` as well as the group's (side-eye 2026-08-19: the three
          bands were map-dom-fallbacks — addressable only as a descendant of the group, which is a path, not
          an identity). A slot names a KIND; the pair names THIS band. */}
      <Row align="center" className="gap-0" data-collection={group.id} data-slot="collection-band" gap="tight">
        {/* A ZERO-MEMBER GROUP HAS NOTHING TO DISCLOSE (side-eye 2026-08-06 P2), so it renders no chevron and
            no body: the old band kept a live toggle whose panel opened onto nothing, one row above the empty
            card that had already said so. The identity cluster stays — same glyph, same kicker, same
            horizon — it just stops pretending to be a door. */}
        {isEmpty ? (
          <Row align="center" className="min-w-0 flex-1 px-tight" gap="tight">
            {/* THE DISCLOSURE GUTTER IS RESERVED, NOT RECLAIMED (side-eye 2026-08-08 P3). Dropping the
                chevron also dropped its 16px box and the 4px joint, so a zero-member band's glyph started
                20px left of every sibling's and the LIST's left edge became data-dependent — a ragged
                column that reads as a rendering bug, not as a stood-down door. The spacer is the SAME
                `Icon` at the SAME size, merely `invisible` (visibility:hidden keeps the box, drops the
                paint, and the glyph is already decorative/aria-hidden), so the gutter cannot drift from the
                chevron it stands in for the way a re-spelled width would. */}
            <Icon className="invisible" icon={ChevronRight} size="sm" />
            <Icon icon={group.icon} size="sm" />
            <Text as="span" voice="interactiveKicker" className="truncate">
              {group.label}
            </Text>
            {/* AND IT SAYS ZERO (same finding). Every other band carries its count, so the one band with
                nothing in it was also the one band that declined to say how much — leaving "empty" and
                "the count hasn't loaded" indistinguishable at exactly the moment the number is the point.
                `isEmpty` IS `count === 0`, so the datum is known here by construction. */}
            <Text as="span" voice="datum">
              {count}
            </Text>
          </Row>
        ) : (
          <Button
            aria-controls={bodyId}
            aria-expanded={open}
            // THE NAME IS THE LABEL AND THE COUNT, UNGLUED (side-eye 2026-08-19 ARIA). The count is a
            // sibling span with no separator between them, and the accessible-name computation
            // concatenates adjacent inline nodes with NOTHING in between — so this disclosure announced
            // "Tags1736", one token, with the number welded onto the library's name. A literal space would
            // fix the string and break the layout (the count is a `datum` span with its own spacing), so
            // the name is stated instead: the VISIBLE kicker keeps its micro-caps voice untouched, and
            // only what a screen reader hears is spelled out.
            //
            // ── THE SEPARATOR IS A SPACE, NOT A COMMA (side-eye 2026-08-19 P1-2; the fork is stated) ──
            // The band VISIBLY reads "Tags 1736" and a name of "Tags, 1736" does not CONTAIN it, which
            // fails WCAG 2.5.3 Label in Name. So the un-glue keeps its one job and spends the one character
            // that is not part of the label: whitespace.
            aria-label={count === undefined ? group.label : `${group.label} ${String(count)}`}
            // THE BAND IS AN ISLAND, NOT A LABELLED BUTTON (side-eye 2026-08-06 P3). `tight` is the token
            // minted for exactly this (glyph↔text inside an island); the padding drops one step for the
            // same reason. Pinned by the narrow-pane CT.
            className="min-w-0 flex-1 justify-start gap-tight px-tight"
            data-slot="config-band"
            intent="ghost"
            onClick={(): void => toggleConfigGroup(group.id)}
            size="sm"
            type="button"
          >
            <Icon icon={open ? ChevronDown : ChevronRight} size="sm" />
            <Icon icon={group.icon} size="sm" />
            <Text as="span" voice="interactiveKicker" className="truncate">
              {group.label}
            </Text>
            {count === undefined ? null : (
              <Text as="span" voice="datum">
                {count}
              </Text>
            )}
          </Button>
        )}
        <CollectionBulkTrigger collection={collection} />
        <CollectionImportTrigger collection={collection} />
        {/* The band's `+` STAYS at zero — it is the standing create affordance at every count, and it is the
            one this group keeps (side-eye 2026-08-08 P2: the zero-slot's button died, the launcher card
            keeps its verb). */}
        <Button aria-label={collection.create.label} intent="ghost" onClick={create} size="icon-sm" title={collection.create.label} type="button">
          <Icon icon={Plus} size="sm" />
        </Button>
      </Row>
      <div id={bodyId} hidden={!open || isEmpty}>
        {open && !isEmpty ? (
          <QueryBoundary
            fallback={<Skeleton className="h-16 w-full" />}
            renderError={(_error, retry): ReactElement => <QueryErrorState label={group.label.toLowerCase()} onRetry={retry} />}
          >
            <CollectionGroupBody
              collection={collection}
              count={count}
              filter={filter}
              kind={group.id}
              label={group.label}
              onFilterChange={setFilter}
              selectedId={selection?.kind === group.id ? selection.memberId : null}
            />
          </QueryBoundary>
        ) : null}
      </div>
      {/* The EMPTY SLOT stays with the band, outside the disclosure: a zero-member group that only says so
          once expanded would read as a library the user has to open to learn is empty. */}
      {isEmpty ? <CollectionGroupEmpty collection={collection} /> : null}
    </Stack>
  );
}

interface CollectionTriggerProps {
  readonly collection: CollectionContribution;
}

/** The group band's BULK-SELECT toggle (REGX2) — rendered only for a collection that declares one, and
 *  split into its own component for the same reason the import door is: whether a collection has a bulk mode
 *  is a module-level BUILD fact, so the hook below it is called unconditionally. */
function CollectionBulkTrigger({ collection }: CollectionTriggerProps): ReactNode {
  const bulk = collection.bulkSelect;
  if (bulk === undefined) {
    return null;
  }
  return <CollectionBulkToggle bulk={bulk} />;
}

function CollectionBulkToggle({ bulk }: { readonly bulk: NonNullable<CollectionContribution["bulkSelect"]> }): ReactElement {
  const mode = bulk.useMode();
  return (
    <Button aria-label={bulk.label} aria-pressed={mode.active} intent="ghost" onClick={mode.toggle} size="icon-sm" title={bulk.label} type="button">
      <Icon icon={ListChecks} size="sm" />
    </Button>
  );
}

/** The group band's IMPORT door (D121-D `band=Import`) — rendered only for a collection that declares one. */
function CollectionImportTrigger({ collection }: CollectionTriggerProps): ReactNode {
  const door = collection.importFile;
  if (door === undefined) {
    return null;
  }
  return <CollectionImportDoor door={door} />;
}

function CollectionImportDoor({ door }: { readonly door: NonNullable<CollectionContribution["importFile"]> }): ReactElement {
  const run = door.useRun();
  return (
    <FileTrigger
      accept={door.accept}
      onFilesSelected={([file]): void => {
        if (file !== undefined) {
          run(file);
        }
      }}
    >
      {({ open }): ReactElement => (
        <Button aria-label={door.label} intent="ghost" onClick={open} size="icon-sm" title={door.label} type="button">
          <Icon icon={Upload} size="sm" />
        </Button>
      )}
    </FileTrigger>
  );
}

interface CollectionGroupBodyProps {
  readonly collection: CollectionContribution;
  readonly kind: ConfigGroupId;
  readonly label: string;
  readonly count: number | undefined;
  readonly filter: string;
  readonly onFilterChange: (next: string) => void;
  readonly selectedId: string | null;
}

/** The expanded body: the host's filter box above the contribution's own rows. */
function CollectionGroupBody({ collection, kind, label, count, filter, onFilterChange, selectedId }: CollectionGroupBodyProps): ReactElement {
  // The filter is COUNT-DRIVEN host chrome, not a per-collection special: any library past a glance earns
  // the same box, in the same place, with the same grammar.
  const filterable = (count ?? 0) > COLLECTION_LARGE_GROUP;
  return (
    <Stack gap="tight">
      {filterable ? (
        <Row align="center" gap="tight">
          <Icon icon={Search} size="sm" className="text-muted-foreground" />
          <Input aria-label={`Filter ${label.toLowerCase()}`} onValueChange={onFilterChange} placeholder={`Filter ${label.toLowerCase()}…`} value={filter} />
        </Row>
      ) : null}
      {collection.list({
        selectedId,
        onSelect: (memberId): void => selectCollectionMemberFromList(kind, memberId),
        filter: filterable ? filter : "",
      })}
    </Stack>
  );
}

/** The zero-member slot — the group keeps its band and says so (empty states are load-bearing). A CARD,
 *  not a row (side-eye 2026-08-08), and it no longer carries the verb (P2: the band's `+` and the launcher
 *  card's verb live; this box lost its button and keeps its copy). Pinned by geometry in the list CT. */
function CollectionGroupEmpty({ collection }: CollectionTriggerProps): ReactElement {
  return (
    <Stack align="center" className="rounded-control border border-input border-dashed px-field py-block" data-slot="collection-group-empty" gap="tight">
      <Text className="text-center" voice="gloss">
        {collection.emptyText}
      </Text>
    </Stack>
  );
}
