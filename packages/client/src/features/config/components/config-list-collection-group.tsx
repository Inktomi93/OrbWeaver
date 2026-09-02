// A COLLECTION group in the Settings LIST (config-rail-spec.md §2 C-4, verbatim) — the band (icon · kicker ·
// count · the trailing verbs) and the owner-rendered member rows under the host's count-driven filter. Split
// out of `config-list-group.tsx` when that file crossed the `component-size` cap (#979/#978 union): the two
// arms of `ConfigListGroup` are two different species — a settings group discloses SECTION rows the host
// derives, a collection discloses MEMBER rows the CONTRIBUTION renders — so the dispatch stayed with the
// props contract and each arm took its own file. `ConfigListGroup` is still the only production caller.
//
// GROUPS START COLLAPSED and the expanded set is remembered per device — the ruling and its reasoning live
// in the dispatch file's header (`config-list-group.tsx`), which owns what is true of BOTH arms; this file
// owns what is true of a collection only. What is true here alone:
//
// THE BAND'S CONTROLS ARE SIBLINGS, never nested: the disclosure is a button spanning the identity cluster,
// and the trailing verbs (the optional BULK toggle, the optional IMPORT trigger, then the create `+`) sit
// BESIDE it — a button inside the disclosure button would be unclickable-by-spec (nested interactives) and
// unreadable to a screen reader. IMPORT leads CREATE because create is the primary and a primary sits last,
// hard against the trailing edge (the world-info list band's landed order, re-homed).
//
// AND THE BAND HAS TWO ARMS BY POPULATION, which is the one thing to read before editing either: a
// populated band DISCLOSES (its click toggles the member rows), a zero-member band SELECTS
// (`CollectionEmptyBand` — it has nothing to disclose, and it is a door to the library's own empty surface
// in the CONTENT pane). Both rulings, and the #925 scope note that fences them, are stated at that
// component.

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
import type { CollectionGroupDefinition, ConfigGroupId } from "#state";
import { selectCollectionMemberFromList, selectConfigGroup, toggleConfigGroup, useCollectionSelection, useConfigGroupOpen } from "#state";

export interface CollectionListGroupProps {
  readonly group: CollectionGroupDefinition;
  /** The EFFECTIVE active group is this one — the zero-member band is the only arm that can BE the current
   *  location (a populated band discloses instead of selecting), so it is the only arm that marks itself. */
  readonly active: boolean;
}

export function CollectionListGroup({ group, active }: CollectionListGroupProps): ReactNode {
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
        {/* A ZERO-MEMBER GROUP HAS NOTHING TO DISCLOSE (side-eye 2026-08-06 P2) — so the empty arm is a
            different band, not this one with pieces missing: no chevron, no panel, and an act of SELECTION
            rather than disclosure. Its own component states that ruling and what #1099 F5 changed about it. */}
        {isEmpty ? (
          <CollectionEmptyBand active={active} count={count} group={group} />
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
            data-config-group={group.id}
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

/** A ZERO-MEMBER collection's band. Its own component for the same reason every other arm here is one —
 *  the group frame reads as a dispatch, not as a pile of ternaries — and because this arm is the ONE band
 *  whose act is selection rather than disclosure, which is a fact worth reading in one place. */
function CollectionEmptyBand({
  group,
  count,
  active,
}: {
  readonly group: CollectionGroupDefinition;
  readonly count: number | undefined;
  readonly active: boolean;
}): ReactElement {
  return (
    // ── THE RULING FORK, STATED (#1099 F5 · the 2026-08-06 P2 ruling in this file, preserved) ──
    // This band was a plain <Row> because "A ZERO-MEMBER GROUP HAS NOTHING TO DISCLOSE": the old band
    // kept a live toggle whose panel opened onto nothing. That ruling was right and it survives
    // INTACT — there is still no chevron, no `aria-expanded`, no panel. Its INPUT changed: the new
    // finding is that the row was not merely undisclosing, it was not a CONTROL at all — `snap --aria`
    // read `text: Regex scripts 0` while a populated sibling read `button "Tags 28"`, so a first-run
    // reader could neither click nor TAB to the library they came for, and interactivity was decided
    // by population. So the band becomes a button whose act is SELECTION, never disclosure: it makes
    // the group active and the CONTENT pane lands on its empty surface (config-content-surface.tsx),
    // which is the only reading under which "a row is a door" is literally true.
    //
    // SCOPE, so nobody generalises this by accident (owner ruling 2026-09-02, recorded on #925): a
    // collection is a GENUINELY DISTINCT species from a settings group, and that distinctness is
    // legitimate — what was illegitimate was a band that did nothing at all. This arm fixes THAT, and
    // says nothing about the POPULATED band, whose activation is still its disclosure (the ruling above,
    // intact). Whether a populated collection keeps disclosure-primary is #925's design call.
    <Button
      aria-current={active ? "true" : undefined}
      // UNGLUED, exactly like its populated twin above (side-eye 2026-08-19 ARIA): the label and the
      // count are adjacent inline nodes, so a computed name welds them into "Regex scripts0". The
      // separator is a SPACE, not a comma, because the visible band reads "Regex scripts 0" and a name
      // must CONTAIN what it shows (WCAG 2.5.3).
      aria-label={`${group.label} ${String(count)}`}
      className="min-w-0 flex-1 justify-start gap-tight px-tight"
      // A BAND NAMES ITS OWN GROUP (side-eye 2026-08-19: a band addressable only as a descendant of
      // its group is a path, not an identity). Every settings band carries the pair; a collection
      // band carried it on the wrapper alone, so a sweep reading ids off `[data-slot=config-band]`
      // got an empty string for it — which is how the LIST sweep hung on a selector matching nothing.
      data-config-group={group.id}
      data-slot="config-band"
      intent="ghost"
      onClick={(): void => selectConfigGroup(group.id, null)}
      size="sm"
      type="button"
    >
      {/* THE DISCLOSURE GUTTER IS RESERVED, NOT RECLAIMED (side-eye 2026-08-08 P3). Dropping the
          chevron also dropped its 16px box and the 4px joint, so a zero-member band's glyph started
          20px left of every sibling's and the LIST's left edge became data-dependent — a ragged column
          that reads as a rendering bug, not as a stood-down door. The spacer is the SAME `Icon` at the
          SAME size, merely `invisible` (visibility:hidden keeps the box, drops the paint, and the glyph
          is already decorative/aria-hidden), so the gutter cannot drift from the chevron it stands in
          for the way a re-spelled width would. */}
      <Icon className="invisible" icon={ChevronRight} size="sm" />
      <Icon icon={group.icon} size="sm" />
      <Text as="span" voice="interactiveKicker" className="truncate">
        {group.label}
      </Text>
      {/* AND IT SAYS ZERO (same finding). Every other band carries its count, so the one band with
          nothing in it was also the one band that declined to say how much — leaving "empty" and "the
          count hasn't loaded" indistinguishable at exactly the moment the number is the point.
          `isEmpty` IS `count === 0`, so the datum is known here by construction. */}
      <Text as="span" voice="datum">
        {count}
      </Text>
    </Button>
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
