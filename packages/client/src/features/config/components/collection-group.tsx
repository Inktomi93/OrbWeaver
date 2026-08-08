// ONE collection GROUP in the Configuration roster — the HOST half of the seam (config-rail-spec.md §2
// C-4/C-6): the band (disclosure · icon · kicker · count · create), the filter box, the empty slot, and the
// per-group QueryBoundary. Everything INSIDE the row area is the contribution's own render.
//
// GROUPS START COLLAPSED (owner ruling 2026-08-02, superseding the mocks' always-expanded drawing): a real
// library is not a glance — the owner's tag library is ~400 rows — so an expanded group would bury every
// sibling collection below its scroll and the roster would stop being the map of what EXISTS. The band is
// the map; expanding is one click, and the expanded set is remembered per device.
//
// THE BAND'S CONTROLS ARE SIBLINGS, never nested: the disclosure is a button spanning the identity cluster,
// and the trailing verbs (the optional IMPORT trigger, then the create `+`) sit BESIDE it — a button inside
// the disclosure button would be unclickable-by-spec (nested interactives) and unreadable to a screen
// reader. IMPORT leads CREATE because create is the primary and a primary sits last, hard against the
// trailing edge (the world-info list band's landed order, re-homed).

import { Button } from "@orb/ui/button";
import { FileTrigger } from "@orb/ui/file-trigger";
import { ChevronDown, ChevronRight, Icon, ListChecks, Plus, Search, Upload } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useId, useState } from "react";
import { QueryBoundary, QueryErrorState } from "#data";
import type { CollectionContribution } from "#lib";
import { COLLECTION_LARGE_GROUP } from "#lib";
import { selectCollectionMemberFromList, toggleCollectionGroup, useCollectionGroupOpen, useCollectionSelection } from "#state";

export interface CollectionGroupProps {
  readonly collection: CollectionContribution;
}

/** One group frame: the band, and — while expanded — the filter, the rows, or the empty slot. */
export function CollectionGroup({ collection }: CollectionGroupProps): ReactNode {
  // Every hook runs UNCONDITIONALLY over the door-frozen registry (the `useVisible` contract) — the
  // visibility verdict gates the RENDER, never the hook call.
  const visible = collection.useVisible?.() ?? true;
  const count = collection.useCount?.();
  const create = collection.create.useRun();
  const open = useCollectionGroupOpen(collection.id);
  const selection = useCollectionSelection();
  const [filter, setFilter] = useState("");
  const bodyId = useId();

  if (!visible) {
    return null;
  }

  const isEmpty = count === 0;
  return (
    <Stack gap="tight" data-slot="collection-group" data-collection={collection.id}>
      <Row align="center" data-slot="collection-band" gap="tight">
        {/* A ZERO-MEMBER GROUP HAS NOTHING TO DISCLOSE (side-eye 2026-08-06 P2), so it renders no chevron and
            no body: the old band kept a live toggle whose panel opened onto nothing, one row above the empty
            card that had already said so. The identity cluster stays — same glyph, same kicker, same
            horizon — it just stops pretending to be a door. */}
        {isEmpty ? (
          <Row align="center" className="min-w-0 flex-1 px-field" gap="tight">
            {/* THE DISCLOSURE GUTTER IS RESERVED, NOT RECLAIMED (side-eye 2026-08-08 P3). Dropping the
                chevron also dropped its 16px box and the 4px joint, so a zero-member band's glyph started
                20px left of every sibling's and the roster's left edge became data-dependent — a ragged
                column that reads as a rendering bug, not as a stood-down door. The spacer is the SAME
                `Icon` at the SAME size, merely `invisible` (visibility:hidden keeps the box, drops the
                paint, and the glyph is already decorative/aria-hidden), so the gutter cannot drift from the
                chevron it stands in for the way a re-spelled width would. */}
            <Icon className="invisible" icon={ChevronRight} size="sm" />
            <Icon icon={collection.icon} size="sm" />
            <Text as="span" voice="kicker" className="truncate">
              {collection.label}
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
            // THE BAND IS AN ISLAND, NOT A LABELLED BUTTON (side-eye 2026-08-06 P3). `Button`'s base
            // `gap-field` (6px) × three joints plus `size="sm"`'s inline padding spent ten pixels of a
            // 271px pane on air, and "REGEX SCRIPTS" — the longest kicker in the door array, on the one
            // collection that ALSO draws all three trailing verbs — lost its tail to an ellipsis at the
            // panel's 17rem clamp floor. `tight` is the token minted for exactly this (glyph↔text inside an
            // island); the padding drops one step for the same reason. Pinned by the narrow-pane CT.
            className="min-w-0 flex-1 justify-start gap-tight px-field"
            intent="ghost"
            onClick={(): void => toggleCollectionGroup(collection.id)}
            size="sm"
            type="button"
          >
            <Icon icon={open ? ChevronDown : ChevronRight} size="sm" />
            <Icon icon={collection.icon} size="sm" />
            <Text as="span" voice="kicker" className="truncate">
              {collection.label}
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
        {/* The band's `+` STAYS at zero, and the empty slot below repeats the verb. The same finding called
            that doubling a defect; the drawn design has both — `empty-states.html:191-193` puts a `+` in the
            zero-count band AND a "New tag" link in `.gempty` — and `config-roster-surface.ct.tsx` ratifies
            it. Only the DEAD half of the finding (a disclosure onto nothing) is fixed here; collapsing the
            two verbs into one is a design call, not a defect fix. */}
        <Button aria-label={collection.create.label} intent="ghost" onClick={create} size="icon" title={collection.create.label} type="button">
          <Icon icon={Plus} size="sm" />
        </Button>
      </Row>
      <div id={bodyId} hidden={!open || isEmpty}>
        {open && !isEmpty ? (
          <QueryBoundary
            fallback={<Skeleton className="h-16 w-full" />}
            renderError={(_error, retry): ReactElement => <QueryErrorState label={collection.label.toLowerCase()} onRetry={retry} />}
          >
            <CollectionGroupBody
              collection={collection}
              count={count}
              filter={filter}
              onFilterChange={setFilter}
              selectedId={selection?.kind === collection.id ? selection.memberId : null}
            />
          </QueryBoundary>
        ) : null}
      </div>
      {/* The EMPTY SLOT stays with the band, outside the disclosure: a zero-member group that only says so
          once expanded would read as a library the user has to open to learn is empty. That ruling is why
          the DISCLOSURE (and not this card) is what stands down at zero — see the band above. */}
      {isEmpty ? <CollectionGroupEmpty collection={collection} onCreate={create} /> : null}
    </Stack>
  );
}

/** The group band's BULK-SELECT toggle (REGX2) — rendered only for a collection that declares one, and
 *  split into its own component for the same reason the import door is: whether a collection has a bulk mode
 *  is a module-level BUILD fact, so the hook below it is called unconditionally.
 *
 *  It leads IMPORT (which leads CREATE): the band reads left-to-right as select · bring in · make new, with
 *  the primary hard against the trailing edge. A pressed toggle, not a menu — the mode is binary and the
 *  reader needs to see at a glance that the rows below have turned into checkboxes. */
function CollectionBulkTrigger({ collection }: CollectionGroupProps): ReactNode {
  const bulk = collection.bulkSelect;
  if (bulk === undefined) {
    return null;
  }
  return <CollectionBulkToggle bulk={bulk} />;
}

function CollectionBulkToggle({ bulk }: { readonly bulk: NonNullable<CollectionContribution["bulkSelect"]> }): ReactElement {
  const mode = bulk.useMode();
  return (
    <Button aria-label={bulk.label} aria-pressed={mode.active} intent="ghost" onClick={mode.toggle} size="icon" title={bulk.label} type="button">
      <Icon icon={ListChecks} size="sm" />
    </Button>
  );
}

/** The group band's IMPORT door (D121-D `band=Import`) — rendered only for a collection that declares one.
 *  Split into its own component so the runner hook is called UNCONDITIONALLY inside it: whether a
 *  collection has an import door is a module-level BUILD fact (the definition is a static value), so the
 *  branch above the hook cannot change across renders — the same discipline the optional `useCount` call
 *  already relies on. */
function CollectionImportTrigger({ collection }: CollectionGroupProps): ReactNode {
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
        // `size="icon"` (not `sm`): an icon-only trigger in an `sm` box measures under the 44px coarse
        // floor — `size="icon"` is `size-control-md`, 34px fine / 48px coarse BY TOKEN (D62 P1).
        <Button aria-label={door.label} intent="ghost" onClick={open} size="icon" title={door.label} type="button">
          <Icon icon={Upload} size="sm" />
        </Button>
      )}
    </FileTrigger>
  );
}

interface CollectionGroupBodyProps {
  readonly collection: CollectionContribution;
  readonly count: number | undefined;
  readonly filter: string;
  readonly onFilterChange: (next: string) => void;
  readonly selectedId: string | null;
}

/** The expanded body: the host's filter box above the contribution's own rows. */
function CollectionGroupBody({ collection, count, filter, onFilterChange, selectedId }: CollectionGroupBodyProps): ReactElement {
  // The filter is COUNT-DRIVEN host chrome, not a per-collection special: any library past a glance earns
  // the same box, in the same place, with the same grammar.
  const filterable = (count ?? 0) > COLLECTION_LARGE_GROUP;
  return (
    <Stack gap="tight">
      {filterable ? (
        <Row align="center" gap="tight">
          <Icon icon={Search} size="sm" className="text-muted-foreground" />
          <Input
            aria-label={`Filter ${collection.label.toLowerCase()}`}
            onValueChange={onFilterChange}
            placeholder={`Filter ${collection.label.toLowerCase()}…`}
            value={filter}
          />
        </Row>
      ) : null}
      {collection.list({
        selectedId,
        onSelect: (memberId): void => selectCollectionMemberFromList(collection.id, memberId),
        filter: filterable ? filter : "",
      })}
    </Stack>
  );
}

/** The zero-member slot — the group keeps its band and says so, with its own create verb as the next step
 *  (empty states are load-bearing: a vanished group would make the roster's membership depend on data).
 *
 *  IT IS A CARD, NOT A ROW (side-eye 2026-08-08). Laid out as a `Row`, the copy and the verb shared one line
 *  inside the dashed box — measured on World Info at the docked pane's width as "No books yet." and the New
 *  book button abreast, which reads as a broken table row rather than as an empty state. The house grammar is
 *  the `EmptyState` primitive's: copy, then the next step BELOW it, centered — spelled here on the group's own
 *  dashed frame rather than by nesting that primitive, because the frame IS this slot's zero marker and a
 *  teaching card inside a card is two boxes saying one thing. Pinned by geometry in the roster CT. */
function CollectionGroupEmpty({ collection, onCreate }: CollectionGroupProps & { readonly onCreate: () => void }): ReactElement {
  return (
    <Stack align="center" className="rounded-control border border-input border-dashed px-field py-block" gap="tight">
      <Text className="text-center" voice="gloss">
        {collection.emptyText}
      </Text>
      {/* SECONDARY, NOT GHOST (side-eye 2026-08-08 P3, the same finding class the landing CTAs took). A
          ghost button is muted text with a hover fill and nothing else — sitting directly under a `gloss`
          sentence inside a dashed card, "New book" read as the second line of the copy rather than as the
          next step. `secondary` gives it the border+foreground chrome that says "this is a control" at
          rest, which is the whole job of the one affordance in an empty state. */}
      <Button intent="secondary" onClick={onCreate} size="sm" type="button">
        {collection.create.label}
      </Button>
    </Stack>
  );
}
