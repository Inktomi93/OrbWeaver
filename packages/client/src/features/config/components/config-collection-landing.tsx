// AN ACTIVE COLLECTION'S CONTENT — the LIBRARY: its glance, its control row, its facts and its MEMBER ROWS.
//
// ═══ THE OWNER MOVED THE MEMBERS HERE (#1725, ruling 2026-09-05) ══════════════════════════════════════
// "tag list under in list is kinda a no go that needs to move into content when clicking onto tags, same
// thing for regex and world info … right now its mixed and looks weird" · "so that means content will need
// to be redesigned for those interfaces to properly be consistent" · "redesign approved it can be built to
// spec but must match the mockups". The spec is `docs/design/mocks/config-collections/DESIGN.md`; this file
// builds §3.2 (the control row) and §3.3 (the rows). The LIST keeps the band and nothing else
// (`config-list-collection-group.tsx`).
//
// This pane used to answer only "the collection is active and no member is open" with a glance, its facts
// and a sentence pointing AT THE LIST. It is the library now, so the sentence is gone (see the copy note
// below) and four things arrived from the LIST: the host's filter box, the create verb, the import door and
// the bulk toggle — every one of them a control the reader can only be looking at while looking at the
// library it belongs to.
//
// ITS HOOKS ARE UNCONDITIONAL FOR ONE CONTRIBUTION'S FIBER, WHICH IS WHY THE MOUNT IS KEYED (#1203 P0 — the
// clause survives this rewrite unchanged and matters MORE now, because this component calls more optional
// hooks than it used to). `useCount?.()`, `insights?.useInsights()` and the declared-or-not `bulkSelect` /
// `importFile` runners are optional-hook calls: their COUNT is fixed per contribution and varies BETWEEN
// contributions, so the invariant holds only while each library gets its own instance. A component is not a
// fiber — the `key={collection.id}` at the mount site (`config-content-surface.tsx`) is what makes that true.
// Any future host of this seam inherits the law; it is a property of the CONTRACT, not of this component.
//
// ═══ THE RULINGS THAT SURVIVE WITH A CHANGED INPUT ════════════════════════════════════════════════════
//  · #1099 F5 arm A — a zero-member library shows its own `emptyText` + one create door, in CONTENT. It was
//    already here and it is untouched (board 07).
//  · #1546's settling/failed split — a failed census states its error with a retry; a settling one draws no
//    verdict. INTACT. What changed is the CREATE verb inside the settling arm: it used to be withheld
//    ("the arm is not yet known"), and that was safe only because "the band's own `+` is on screen
//    throughout, so nothing is unreachable during that beat". The band's `+` moved here, so withholding it
//    would now make create genuinely unreachable for the beat — the capability lie the F5 ruling bans. The
//    control row therefore draws at every arm except the failure one, which has nothing to control.
//  · #1209's "the landing states what the LIST structurally cannot" — the facts stay, and they are still
//    drawn ONCE. They said what the LIST could not; they now say what the ROWS do not, which is the same
//    sentence about a different neighbour.
//  · The 30-member filter gate and `COLLECTION_WINDOW_MAX_HEIGHT` are DELETED WITH THEIR PREMISE, not
//    retuned (DESIGN.md §3.2 · stickler). Both existed because three collapsible bands shared one LIST
//    scroll column: the box had to be capped so a first library could not push its siblings below the fold,
//    and the filter was worth its 32px only past a glance. This pane is the library's alone and its scroller
//    is the pane, so the cap has nothing to protect and the filter is always worth drawing. Virtualisation
//    above 30 rows stays — that is a rendering budget, not a geometry one.
//
// THE HOST SENTENCE IS GONE, AND THAT IS A STATED DEVIATION. `CONFIG_COLLECTION_LANDING.hint` read "Pick one
// from the list to open its editor." The stickler's §5.3 says such copy must be REPLACED rather than
// deleted; the approved board 02 draws no sentence in this position, and "must match the mockups" is the
// newer and higher word. The sentence's JOB was to say where the members are, and the members are now the
// next thing on the pane — a line restating that would be the affordance-shaped text #1209 removed from
// this very surface. Deleted with its one reader; the fork is recorded in the build report.

import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { FileTrigger } from "@orb/ui/file-trigger";
import { Icon, ListChecks, MoreVertical, Search, Upload } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { QueryBoundary, QueryErrorState } from "#data";
import type { CollectionContribution, CollectionInsight } from "#lib";
import type { CollectionGroupDefinition } from "#state";
import { selectCollectionMemberFromList, useCollectionSelection } from "#state";
import { ConfigLibraryGlance } from "./config-library-glance.tsx";

export function ConfigCollectionLanding({ group }: { readonly group: CollectionGroupDefinition }): ReactNode {
  const collection = group.body.collection;
  const census = collection.useCount?.();
  const count = census?.count;
  const insights = collection.insights?.useInsights();
  const create = collection.create.useRun();
  const selection = useCollectionSelection();
  // The filter is HOST chrome — one grammar and one box for every library — and applying it is the owner's,
  // because the owner is the only party that knows what its rows are made of (`CollectionListView.filter`).
  // It lives here rather than in the LIST band's frame for the same reason the rows do.
  const [filter, setFilter] = useState("");
  // A census that FAILED and produced no number. A failed REFETCH over a warm cache still has a number, and
  // that arm keeps stating it — the pane says "couldn't load" only when it genuinely has nothing to say.
  if (census !== undefined && census.failed && count === undefined) {
    return (
      <Stack data-collection={group.id} data-slot="config-collection-landing" gap="section">
        {/* The library still NAMES itself while its census is broken: the reader navigated here on purpose,
            and a pane that answers a click with an error alone loses the one fact it never had to read. */}
        <ConfigLibraryGlance group={group} level={2} />
        <QueryErrorState label={group.label.toLowerCase()} onRetry={census.retry} />
      </Stack>
    );
  }
  if (count === 0) {
    return (
      <EmptyState
        action={
          <Button intent="primary" onClick={create} type="button">
            {collection.create.label}
          </Button>
        }
        // THE READER WITH NOTHING GETS THE MOST TEACHING, NOT THE LEAST (#1213). This arm passed `emptyText`
        // alone, so the one reader who has never seen the library — the first-timer the empty state exists
        // for — was the only one the surface declined to tell what it is FOR, while the settling arm below
        // and the LIST's own slot both showed the blurb. Two sentences, in the order a cold reader needs
        // them: what this library is, then that theirs is empty.
        description={
          <>
            {group.description} {collection.emptyText}
          </>
        }
        icon={<Icon icon={group.icon} size="lg" />}
        measure="wide"
        title={group.label}
        // The pane's ONLY content, so its title is the pane's heading — a landing that left `main` headingless
        // dead-ends heading navigation (the primitive's own `titleAs` note).
        titleAs="h2"
        titleStep="focal"
      />
    );
  }
  return (
    <Stack data-collection={group.id} data-slot="config-collection-landing" gap="section">
      {/* `level={2}`: this glance IS the pane's identity, so its name is the pane's heading. */}
      <ConfigLibraryGlance group={group} level={2} />
      <CollectionControlRow collection={collection} filter={filter} label={group.label} onFilterChange={setFilter} />
      {/* THE FACTS THE ROWS DO NOT STATE (#1209). A settling read (`undefined`) draws no facts at all — the
          same "not a verdict" discipline the count arms follow — and a library that declares none simply
          lands on its glance, its controls and its rows. */}
      {insights === undefined || insights.length === 0 ? null : <CollectionInsightList insights={insights} />}
      {/* THE MEMBERS. The contribution's own rows, its own query, its own row anatomy — the host learns
          nothing about what a member IS. The boundary moved here with them: `collection.list` suspends on the
          library's read, and an error inside it is the library's to retry, not the pane's to swallow. */}
      <QueryBoundary
        fallback={<Skeleton className="h-16 w-full" />}
        renderError={(_error, retry): ReactElement => <QueryErrorState label={group.label.toLowerCase()} onRetry={retry} />}
      >
        {collection.list({
          selectedId: selection?.kind === group.id ? selection.memberId : null,
          onSelect: (memberId): void => selectCollectionMemberFromList(group.id, memberId),
          filter,
        })}
      </QueryBoundary>
    </Stack>
  );
}

/**
 * The library's CONTROL ROW (DESIGN.md §3.2) — filter · bulk · overflow · create.
 *
 * Every control here is DECLARED DATA the host draws blind (`create`, `bulkSelect`, `importFile`) plus the
 * host's own filter box. The host never learns what a member is, what a bulk selection MEANS, or what an
 * imported file contains — the `collection-contracts.ts` split is unchanged by the move: host draws the
 * door, owner decides what walks through it.
 *
 * IMPORT SITS IN AN OVERFLOW, NEVER AS A BARE BUTTON (§3.2), and the overflow is drawn ONLY when it has
 * something in it. An empty kebab is the capability lie #925's must-WORK bar names — a control whose one act
 * is to open onto nothing. Tags and rosters declare no import, so they draw no overflow.
 *
 * NOT DRAWN HERE YET, and both are named rather than silently missing: the library's SORT (board 02's
 * `Most used ▾`) and tags' `Prune unused tags`. Neither is declared by `CollectionContribution` today — the
 * tag sort lives inside `tag-collection-rows.tsx`'s own state and Prune is not a verb any contribution
 * raises — and a mock line is not authorization to mint seam surface. The sort's contract field is
 * owner-ruled (2026-09-05) and lands with the rest of §3.2; Prune is an open question. Until then the tag
 * sort keeps rendering where its contribution already draws it, one row lower than the board puts it.
 */
function CollectionControlRow({
  collection,
  label,
  filter,
  onFilterChange,
}: {
  readonly collection: CollectionContribution;
  readonly label: string;
  readonly filter: string;
  readonly onFilterChange: (next: string) => void;
}): ReactElement {
  // `useRun` is a HOOK returning the runner, called unconditionally once per rendered affordance (the
  // contract's own discipline) — hoisted out of the JSX so the call site reads as the hook it is.
  const create = collection.create.useRun();
  return (
    <Row align="center" data-slot="collection-control-row" gap="field">
      <Row align="center" className="min-w-0 flex-1" gap="tight">
        <Icon className="text-muted-foreground" icon={Search} size="sm" />
        {/* A FILTER, never the settings index's jump search (§3.2): it narrows THIS library's rows in place,
            which is the verb every peer LIST pane's `Input` performs. The settings `combobox` above it jumps
            instead, and the two must not read as one control. */}
        <Input aria-label={`Filter ${label.toLowerCase()}`} onValueChange={onFilterChange} placeholder={`Filter ${label.toLowerCase()}…`} value={filter} />
      </Row>
      <CollectionBulkToggle collection={collection} />
      <CollectionOverflow collection={collection} />
      <Button intent="primary" onClick={create} size="sm" type="button">
        {collection.create.label}
      </Button>
    </Row>
  );
}

/** The bulk-select MODE toggle — host chrome, contribution state (`bulkSelect.useMode`). The selection BAR
 *  and the checkbox rows are the contribution's, inside `list`: the host draws mode ENTRY in one grammar for
 *  every library and never learns what the selection means. Its own component so the optional hook runs
 *  unconditionally for the one contribution that declares it. */
function CollectionBulkToggle({ collection }: { readonly collection: CollectionContribution }): ReactNode {
  const bulk = collection.bulkSelect;
  if (bulk === undefined) {
    return null;
  }
  return <BulkToggleButton bulk={bulk} />;
}

function BulkToggleButton({ bulk }: { readonly bulk: NonNullable<CollectionContribution["bulkSelect"]> }): ReactElement {
  const mode = bulk.useMode();
  return (
    <Button aria-label={bulk.label} aria-pressed={mode.active} intent="ghost" onClick={mode.toggle} size="icon-sm" title={bulk.label} type="button">
      <Icon icon={ListChecks} size="sm" />
    </Button>
  );
}

/** The overflow — drawn only when it has an item. Today that means exactly `importFile`. */
function CollectionOverflow({ collection }: { readonly collection: CollectionContribution }): ReactNode {
  const door = collection.importFile;
  if (door === undefined) {
    return null;
  }
  return <ImportOverflow door={door} />;
}

function ImportOverflow({ door }: { readonly door: NonNullable<CollectionContribution["importFile"]> }): ReactElement {
  const run = door.useRun();
  return (
    // The FileTrigger wraps the MENU, never sits inside its popup: its `<input type="file">` is a real
    // element, and a popup that unmounts on the item's own click would take the input with it before the
    // picker could open. Outside, the input is a stable sibling and `open()` survives the close.
    <FileTrigger
      accept={door.accept}
      onFilesSelected={([file]): void => {
        if (file !== undefined) {
          run(file);
        }
      }}
    >
      {({ open }): ReactElement => (
        <Menu>
          <MenuTrigger
            render={
              <Button aria-label="More library actions" intent="ghost" size="icon-sm">
                <Icon icon={MoreVertical} size="sm" />
              </Button>
            }
          />
          <MenuPopup align="end">
            <MenuItem onClick={open}>
              <Icon icon={Upload} size="sm" />
              {door.label}
            </MenuItem>
          </MenuPopup>
        </Menu>
      )}
    </FileTrigger>
  );
}

/** The library's own facts, in ONE grammar for every collection: the statement (`label` · `value`) and, when
 *  the fact is about a single member, the door that opens it.
 *
 *  A ROW IS DATA UNLESS IT HAS A DOOR, which is the whole point of #1209: what this replaced was twelve
 *  chips that LOOKED like targets and were text, over members the LIST was already showing. So a fact with
 *  no `open` renders as a labelled value — no border, no hover, nothing that reads as pressable — and a fact
 *  WITH one renders a real `Button` whose accessible name is the contribution's own ("Open strip ooc"). The
 *  host never learns what a fact means; it draws `label · value · door` blind. */
function CollectionInsightList({ insights }: { readonly insights: readonly CollectionInsight[] }): ReactElement {
  return (
    <Stack data-slot="config-library-insights" gap="field">
      {insights.map((insight) => (
        <Row align="center" gap="field" key={insight.id}>
          <Text as="span" voice="kicker">
            {insight.label}
          </Text>
          <Text as="span" voice="datum">
            {insight.value}
          </Text>
          {insight.open === undefined ? null : (
            <Button className="ms-auto" intent="ghost" onClick={insight.open.run} size="sm" type="button">
              {insight.open.label}
            </Button>
          )}
        </Row>
      ))}
    </Stack>
  );
}
