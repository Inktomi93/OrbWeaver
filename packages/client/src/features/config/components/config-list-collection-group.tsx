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
// THE VOICE BUDGET IS THE PANE'S, NOT PER-SPECIES (#1714, 2026-09-05). Its ONE home is
// `config-list-group.tsx`'s header and it governs this file too: `interactiveKicker` names this band
// because a band is a control that names a region, `datum` is its mono count, `gloss` is the empty
// library's sentence — and a STATE mark would be a `Badge`, never a voice. This arm carries no state mark
// at all, and that is a fact about the DATA rather than a choice: `useConfigModified` resolves a section
// contribution's `owns` SettingsKeyClaim and a collection declares none, so "differs from its default" is
// not a question a library can be asked; and `ConfigGroupBody`'s three arms make `collection` and
// `{ placeholder: true }` mutually exclusive, so it can never be unbuilt either. Both were priced when the
// owner retired the #925 species fence (`docs/design/config-revamp-design.md` §8.1a).
//
// THE BAND'S CONTROLS ARE SIBLINGS, never nested: the disclosure is a button spanning the identity cluster,
// and the trailing verbs (the optional BULK toggle, the optional IMPORT trigger, then the create `+`) sit
// BESIDE it — a button inside the disclosure button would be unclickable-by-spec (nested interactives) and
// unreadable to a screen reader. IMPORT leads CREATE because create is the primary and a primary sits last,
// hard against the trailing edge (the world-info list band's landed order, re-homed).
//
// AND THE BAND HAS TWO ARMS BY POPULATION, which is the one thing to read before editing either — but as of
// #925 both arms are DOORS, and population decides only what is behind them: a zero-member band SELECTS into
// the library's own empty surface (`CollectionEmptyBand`, #1099 F5), and a populated band ENTERS the library
// on the first click (CONTENT lands on its landing) then TOGGLES its rows on the next
// (`CollectionMemberBand`). Each component states its own ruling fork in full; read the one you are editing.

import { Button } from "@orb/ui/button";
import { FileTrigger } from "@orb/ui/file-trigger";
import { ChevronDown, ChevronRight, Icon, ListChecks, Plus, Search, Upload } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode, RefObject } from "react";
import { useId, useState } from "react";
import { QueryBoundary, QueryErrorState } from "#data";
import type { CollectionContribution } from "#lib";
import { COLLECTION_LARGE_GROUP } from "#lib";
import type { CollectionGroupDefinition, ConfigGroupId } from "#state";
import { selectCollectionMemberFromList, selectConfigGroup, toggleConfigGroup, useCollectionSelection, useConfigGroupOpen } from "#state";

export interface CollectionListGroupProps {
  readonly group: CollectionGroupDefinition;
  /** The EFFECTIVE active group is this one. BOTH arms can now BE the current location (#925): each marks
   *  itself `aria-current` while no member of the collection is open, and the populated arm's click toggles
   *  its rows rather than re-entering once it is already the location. */
  readonly active: boolean;
  /** The SECTION's arrival focus target (#1218) — handed to the ACTIVE group only, whichever species it is. */
  readonly bandRef?: RefObject<HTMLButtonElement | null>;
}

export function CollectionListGroup({ group, active, bandRef }: CollectionListGroupProps): ReactNode {
  const collection = group.body.collection;
  // Every hook runs UNCONDITIONALLY over the door-frozen registry (the `useVisible` contract) — the
  // visibility verdict gates the RENDER, never the hook call.
  const visible = collection.useVisible?.() ?? true;
  // The BAND reads the number only. A census that failed has no number, which is the same thing the band
  // draws for one that has not landed — a bare "TAGS" with no figure, never a fabricated `0`. The FAILURE
  // half is the LANDING's to say (#1546): it is the pane the reader is looking at, and it is the surface
  // that can carry a retry without turning a one-line band into an error state.
  const count = collection.useCount?.().count;
  const create = collection.create.useRun();
  const open = useConfigGroupOpen(group.id);
  const selection = useCollectionSelection();
  const [filter, setFilter] = useState("");
  const bodyId = useId();
  const bandId = `${bodyId}-band`;

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
          <CollectionEmptyBand active={active} bandId={bandId} count={count} group={group} {...(bandRef === undefined ? {} : { bandRef })} />
        ) : (
          <CollectionMemberBand
            active={active}
            bandId={bandId}
            {...(bandRef === undefined ? {} : { bandRef })}
            bodyId={bodyId}
            count={count}
            group={group}
            memberOpen={selection?.kind === group.id}
            open={open}
          />
        )}
        <CollectionBulkTrigger collection={collection} hasMembers={!isEmpty && count !== undefined} />
        <CollectionImportTrigger collection={collection} />
        {/* The band's `+` STAYS at zero — it is the standing create affordance at every count, and it is the
            one this group keeps (side-eye 2026-08-08 P2: the zero-slot's button died, the launcher card
            keeps its verb). */}
        <Button aria-label={collection.create.label} intent="ghost" onClick={create} size="icon-sm" title={collection.create.label} type="button">
          <Icon icon={Plus} size="sm" />
        </Button>
      </Row>
      {/* THE MEMBER ROWS ARE AN OWNED, NAMED GROUP (#1214-3) — the settings arm's anatomy, same reason: a
          bare `div` is transparent to AT, so the contribution's rows announced as siblings of the band. */}
      <div id={bodyId} hidden={!open || isEmpty}>
        {open && !isEmpty ? (
          <QueryBoundary
            fallback={<Skeleton className="h-16 w-full" />}
            renderError={(_error, retry): ReactElement => <QueryErrorState label={group.label.toLowerCase()} onRetry={retry} />}
          >
            <CollectionGroupBody
              bandId={bandId}
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

/**
 * A POPULATED collection's band: the disclosure over its member rows, and — as of #925 — a real DOOR into
 * the library it names.
 *
 * ═══ THE RULING FORK, STATED (#925 owner rulings 2026-09-02 · the 2026-08-06 P2 ruling, preserved) ═══
 *
 * THE RECORDED RULING was "a collection group's activation is only its DISCLOSURE" (`config-section.tsx`'s
 * `makeSelectionSeam`, and this file's own zero-member note). It survives as the fact it always was — a
 * collection's CONTENT is a MEMBER, so a collection group does not PUSH on a phone and its band is not a
 * settings band. Its INPUT changed twice over, and both changes are the owner's own:
 *   1. The species correction (2026-09-02): collections are a distinct species whose bar is THEY MUST WORK
 *      — no dead ends, no capability lies — and the populated arm's interaction contract is #925's call.
 *   2. The ARRIVAL DEFAULT (same day): a group is now active from the first frame. So "disclosure only"
 *      stopped meaning "CONTENT is untouched" and started meaning "CONTENT keeps showing the FIRST GROUP'S
 *      SETTINGS while the LIST says you are in Tags" — a click that opens rows under a pane about something
 *      else, which is the capability lie by the owner's own click-count lens.
 *
 * SO THE ACT IS SPLIT BY WHERE THE READER ALREADY IS, which is the honest reading of both rulings:
 *  · NOT the active group ⇒ ENTER the library: `selectConfigGroup` makes it the location (CONTENT lands on
 *    its own landing — `config-content-surface.tsx`) and opens it in the same act. This is the zero-member
 *    band's landed F5 behavior, now true of the arm beside it: population decides the ARM, never whether a
 *    band is a door.
 *  · ALREADY the active group ⇒ TOGGLE its rows. The disclosure survives as a capability — a 400-row library
 *    the reader wants folded away without leaving it — and collapsing does not clear the location, so the
 *    landing (or the open member's editor) stays put. This is the ONE place this species diverges from a
 *    settings group, whose active band deliberately cannot collapse itself, and the divergence is
 *    species-legitimate: a settings group's rows ARE its map of the pane beside it, while a library's rows
 *    are its contents, and folding contents away is a thing a reader does.
 */
function CollectionMemberBand({
  group,
  count,
  open,
  active,
  memberOpen,
  bandId,
  bodyId,
  bandRef,
}: {
  readonly group: CollectionGroupDefinition;
  readonly count: number | undefined;
  readonly open: boolean;
  readonly active: boolean;
  /** A member of THIS collection is open — then the member's row is the location, not the band. */
  readonly memberOpen: boolean;
  /** The band's own id — the NAME its expanded row group points at (#1214-3). */
  readonly bandId: string;
  readonly bodyId: string;
  /** Present on the ACTIVE group only — the section's arrival focus target (#1218). */
  readonly bandRef?: RefObject<HTMLButtonElement | null>;
}): ReactElement {
  return (
    <Button
      aria-controls={bodyId}
      // THE BAND IS THE LOCATION WHEN NO MEMBER IS (the one-current-per-location rule, applied to this
      // species). A settings band that owns rows never carries `aria-current` because its active CHILD does;
      // a collection band's children are MEMBERS, and while none is open nothing below it is the reader's
      // place — so the band is, exactly as the zero-member arm already says of itself.
      aria-current={active && !memberOpen ? "true" : undefined}
      aria-expanded={open}
      // THE NAME IS THE LABEL AND THE COUNT, UNGLUED (side-eye 2026-08-19 ARIA). The count is a sibling span
      // with no separator between them, and the accessible-name computation concatenates adjacent inline
      // nodes with NOTHING in between — so this disclosure announced "Tags1736", one token, with the number
      // welded onto the library's name. A literal space would fix the string and break the layout (the count
      // is a `datum` span with its own spacing), so the name is stated instead: the VISIBLE kicker keeps its
      // micro-caps voice untouched, and only what a screen reader hears is spelled out.
      //
      // ── THE SEPARATOR IS A SPACE, NOT A COMMA (side-eye 2026-08-19 P1-2; the fork is stated) ──
      // The band VISIBLY reads "Tags 1736" and a name of "Tags, 1736" does not CONTAIN it, which fails WCAG
      // 2.5.3 Label in Name. So the un-glue keeps its one job and spends the one character that is not part
      // of the label: whitespace.
      aria-label={count === undefined ? group.label : `${group.label} ${String(count)}`}
      // THE BAND IS AN ISLAND, NOT A LABELLED BUTTON (side-eye 2026-08-06 P3). `tight` is the token minted
      // for exactly this (glyph↔text inside an island); the padding drops one step for the same reason.
      // Pinned by the narrow-pane CT.
      className="min-w-0 flex-1 justify-start gap-tight px-tight"
      data-config-group={group.id}
      data-slot="config-band"
      id={bandId}
      intent="ghost"
      {...(bandRef === undefined ? {} : { ref: bandRef })}
      onClick={(): void => {
        if (active) {
          toggleConfigGroup(group.id);
          return;
        }
        // `selectConfigGroup` opens the group as part of landing on it, so entering is ONE act and never a
        // select-then-toggle pair that could land closed. `null` for the section: a collection has none.
        selectConfigGroup(group.id, null);
      }}
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
  );
}

/** A ZERO-MEMBER collection's band. Its own component for the same reason every other arm here is one —
 *  the group frame reads as a dispatch, not as a pile of ternaries — and because this arm is the ONE band
 *  whose act is selection rather than disclosure, which is a fact worth reading in one place. */
function CollectionEmptyBand({
  group,
  count,
  active,
  bandId,
  bandRef,
}: {
  readonly group: CollectionGroupDefinition;
  readonly count: number | undefined;
  readonly active: boolean;
  readonly bandId: string;
  /** Present on the ACTIVE group only — the section's arrival focus target (#1218). */
  readonly bandRef?: RefObject<HTMLButtonElement | null>;
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
    // legitimate — what was illegitimate was a band that did nothing at all. #925 then made the call this
    // note reserved for it: the POPULATED band is a door too (it ENTERS the library, and toggles its rows
    // only once the reader is already there — `CollectionMemberBand` states that fork). What did NOT
    // change is the species: neither arm PUSHES on a phone (`isPushingGroup`), because a collection's
    // CONTENT is a member and a member is what pushes.
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
      // The id its group's (always hidden, on this arm) row wrapper is NAMED by (#1214-3) — carried by both
      // band arms so the relation resolves whichever one is drawn.
      id={bandId}
      intent="ghost"
      {...(bandRef === undefined ? {} : { ref: bandRef })}
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
/**
 * The band's BULK-SELECT toggle — drawn for a collection that DECLARES one and HAS members to select
 * (#1212).
 *
 * THE MEMBERS DECIDE, NOT THE KIND. Measured on the live surface: the regex library at count 0 drew "Select
 * scripts" — enabled, focusable, `aria-disabled` unset — over a library with nothing in it, so the one thing
 * the control could do was enter a mode with no rows to check. That is the capability lie ruling 1 names,
 * and it is the same class as the zero-member band that was not a control at all: population must decide
 * what a control CAN DO, never whether a row is a door. A settling count (`undefined`) draws nothing either
 * — a toggle that appears a beat later is chrome that moved, and the mode it opens is meaningless until the
 * rows exist.
 *
 * `hasMembers` is a PROP rather than a second `useCount()` here for the reason the whole file is shaped this
 * way: the count is already read once, unconditionally, at the top of the group frame.
 */
function CollectionBulkTrigger({ collection, hasMembers }: CollectionTriggerProps & { readonly hasMembers: boolean }): ReactNode {
  const bulk = collection.bulkSelect;
  if (bulk === undefined || !hasMembers) {
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
  /** The band that NAMES these rows (#1214-3) — the group's label, so the rows are an owned, named set in
   *  the accessibility tree rather than siblings of the control that opened them. */
  readonly bandId: string;
  readonly kind: ConfigGroupId;
  readonly label: string;
  readonly count: number | undefined;
  readonly filter: string;
  readonly onFilterChange: (next: string) => void;
  readonly selectedId: string | null;
}

/** The expanded body: the host's filter box above the contribution's own rows. */
function CollectionGroupBody({ collection, kind, label, count, filter, onFilterChange, selectedId, bandId }: CollectionGroupBodyProps): ReactElement {
  // The filter is COUNT-DRIVEN host chrome, not a per-collection special: any library past a glance earns
  // the same box, in the same place, with the same grammar.
  const filterable = (count ?? 0) > COLLECTION_LARGE_GROUP;
  return (
    <Stack aria-labelledby={bandId} gap="tight" role="group">
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

/**
 * The zero-member slot — the group keeps its band and says so (empty states are load-bearing).
 *
 * ═══ THE RULING FORK, STATED (#1211 · side-eye 2026-08-08 "A CARD, not a row", preserved as far as it goes) ═══
 *
 * THE RECORDED RULING was that this slot is a CARD rather than a row, and that it keeps its copy after
 * losing its verb. The COPY half survives untouched and is not up for debate: a library that says nothing
 * about being empty reads as a feature that was never built. Its INPUT changed — the measurement is now of
 * a whole SHELF rather than one slot. Measured on the live desktop surface at the lane's base commit: the
 * ONE populated library was a 32px band while each of the three EMPTY groups totalled 75px, of which a
 * 39px dashed box — so the loudest, tallest and only bordered thing on the shelf was the part with nothing
 * in it. A card is a container for CONTENTS, and the state this one announces is that there are none.
 *
 * SO THE BOX GOES AND THE SENTENCE STAYS (13px line; the group totals 49px). The band's own count is
 * already the honest zero (the #1099 F5 datum, unchanged), which leaves this slot one job — teaching what
 * the library is for — and one line is the right amount of surface for one job. It stays a NAMED slot so
 * the pane can still be swept for it, and keeps the band's text indent so it reads as the band's line.
 */
function CollectionGroupEmpty({ collection }: CollectionTriggerProps): ReactElement {
  return (
    // `px-tight` matches the band Button's own horizontal padding, so the sentence starts on the band's
    // CONTENT edge — the same column as the disclosure gutter's glyph, not the pane's edge. That shared
    // edge is what makes it read as this group's line rather than as something floating between groups.
    <Text className="px-tight" data-slot="collection-group-empty" voice="gloss">
      {collection.emptyText}
    </Text>
  );
}
