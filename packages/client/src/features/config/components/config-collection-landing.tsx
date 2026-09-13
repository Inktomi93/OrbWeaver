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
//    retuned (DESIGN.md §3.2/§5.4 · stickler). Both existed because three collapsible bands shared one LIST
//    scroll column: the box had to be capped so a first library could not push its siblings below the fold,
//    and the filter was worth its 32px only past a glance. This pane is the library's alone and its scroller
//    is the pane, so the cap has nothing to protect and the filter is always worth drawing. Virtualisation
//    above 30 rows stays — that is a rendering budget, not a geometry one. The CAP became a RE-BIND rather
//    than a bare deletion, because `@orb/ui/virtual-list` throws on an unbounded scroll box: the landing is
//    `min-h-0 flex-1` inside the pane and each windowed arm is `min-h-0 flex-1` inside the landing, so the
//    window is the pane's height at every width instead of 384px at all of them.
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
import { Icon, ListChecks, MoreVertical, Plus, Trash2, Upload } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@orb/ui/menu";
import { Select } from "@orb/ui/select";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState } from "#data";
import type { CollectionContribution, CollectionInsight } from "#lib";
import type { CollectionGroupDefinition } from "#state";
import { selectCollectionMemberFromList, useCollectionSelection } from "#state";
import { ConfigPaneGlance } from "./config-pane-glance.tsx";

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
        <ConfigPaneGlance blurb={true} group={group} level={2} />
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
    // THE LANDING IS THE PANE'S COLUMN, NOT A BLOCK INSIDE IT (#1725, DESIGN.md §5.4). `min-h-0 flex-1` is
    // what re-bound the windowed arm's height from a flat 384px (`COLLECTION_WINDOW_MAX_HEIGHT`) to the
    // CONTENT pane's own `overflow-y-auto overscroll-contain` box: this column takes the pane's free space, and each library's
    // `VirtualList` takes this column's. `min-h-0` is the half that does the work — a flex child defaults to
    // `min-height: auto`, so without it the scroller grows to its content, virtualization is a no-op, and
    // the primitive's own unbounded-window guard throws at mount. A SHORT library still overflows this box
    // into the pane's scroller (overflow is visible), so a non-windowed list is unchanged.
    <Stack className="min-h-0 flex-1" data-collection={group.id} data-slot="config-collection-landing" gap="section">
      {/* `level={2}`: this glance IS the pane's identity, so its name is the pane's heading. */}
      <ConfigPaneGlance blurb={true} group={group} level={2} />
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
 * The library's CONTROL ROW (DESIGN.md §3.2, board 02/04) — filter · sort · bulk · create · overflow, in
 * that visual order, six controls maximum.
 *
 * Every control here is DECLARED DATA the host draws blind (`create`, `sort`, `bulkSelect`, `importFile`,
 * `actions`) plus the host's own filter box. The host never learns what a member is, what a sort MODE means,
 * what a bulk selection MEANS, or what an imported file contains — the `collection-contracts.ts` split is
 * unchanged by the move: host draws the door, owner decides what walks through it.
 *
 * IMPORT SITS IN AN OVERFLOW, NEVER AS A BARE BUTTON (§3.2), and the overflow is drawn ONLY when it has
 * something in it. An empty kebab is the capability lie #925's must-WORK bar names — a control whose one act
 * is to open onto nothing. Rosters declare neither an import nor an action, so they draw no overflow.
 *
 * THE OPTIONAL HOOKS EACH GET THEIR OWN COMPONENT, and that is not style: `sort.useMode`, `bulkSelect.useMode`,
 * `importFile.useRun` and every `actions[].useRun` are hooks whose EXISTENCE varies by contribution. Calling
 * them behind an `=== undefined` test in this component would make the hook COUNT conditional inside one
 * fiber; a child component that renders only when the field is declared makes each call unconditional for
 * its own fiber, and the #1203 `key={collection.id}` at the mount site keeps that true across a library
 * switch.
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
      {/* A FILTER, never the settings index's jump search (§3.2): it narrows THIS library's rows in place,
          which is the verb every peer LIST pane's `Input` performs. The settings `combobox` above it jumps
          instead, and the two must not read as one control.
          NO LEADING GLYPH, and that is a MEASURED call rather than a taste one (#1725): the row carries five
          controls and the filter is the only one that flexes, so every fixed pixel beside it comes out of the
          one box a reader types into. At 430 the glyph + its joint took the filter to ~85px — "Filter tag",
          clipped mid-word — against ~130px in the approved p2 board, which draws no glyph either. The
          placeholder already names the verb. */}
      <Row align="center" className="min-w-0 flex-1">
        <Input aria-label={`Filter ${label.toLowerCase()}`} onValueChange={onFilterChange} placeholder={`Filter ${label.toLowerCase()}…`} value={filter} />
      </Row>
      <CollectionSort collection={collection} />
      <CollectionBulkToggle collection={collection} />
      {/* CREATE IS THE ROW'S ONE PRIMARY (C-2's no-aggregate-primary ruling is about the WELCOME, not here):
          it is the library's own verb, on the library's own pane. */}
      <Button intent="primary" onClick={create} size="sm" type="button">
        <Icon icon={Plus} size="sm" />
        {collection.create.label}
      </Button>
      <CollectionOverflow collection={collection} />
    </Row>
  );
}

/** The library's READING ORDER (`sort`) — host chrome, contribution data. Its own component so the optional
 *  hook runs unconditionally for the one contribution that declares it. */
function CollectionSort({ collection }: { readonly collection: CollectionContribution }): ReactNode {
  const sort = collection.sort;
  if (sort === undefined) {
    return null;
  }
  return <SortSelect sort={sort} />;
}

function SortSelect({ sort }: { readonly sort: NonNullable<CollectionContribution["sort"]> }): ReactElement {
  const mode = sort.useMode();
  return (
    // `w-auto`: the field control's own `w-full` would claim the row for a three-word label, and the filter
    // is what should be taking the slack (side-eye 2026-08-03 P2, re-homed with the control).
    <Select
      aria-label={sort.label}
      // @orb-waive ui-size-via-variant(w-auto): content-width Select leaves the row slack to its filter; auto overrides the standard w-full deterministically.
      className="w-auto"
      items={mode.options}
      onValueChange={(value): void => {
        if (value !== null) {
          mode.setMode(value);
        }
      }}
      value={mode.mode}
    />
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
    // LABELLED, not icon-only (board 04 draws "✓ Select scripts"): entering a bulk MODE changes what every
    // row is, and a bare glyph beside four other controls is not a name a reader can act on.
    <Button aria-pressed={mode.active} intent="ghost" onClick={mode.toggle} size="sm" type="button">
      <Icon icon={ListChecks} size="sm" />
      {bulk.label}
    </Button>
  );
}

/** The overflow — the library-level menu, drawn ONLY when it has an item. Its contents are `importFile`
 *  (D121-D's band Import, re-homed here by DESIGN.md §3.2) and every declared `actions` entry. A
 *  contribution declaring NEITHER gets no kebab at all: a control whose one act is to open onto nothing is
 *  the capability lie this seam's must-WORK bar names. */
function CollectionOverflow({ collection }: { readonly collection: CollectionContribution }): ReactNode {
  const door = collection.importFile;
  const actions = collection.actions ?? [];
  if (door === undefined && actions.length === 0) {
    return null;
  }
  // The two arms are separate COMPONENTS rather than one with a conditional `useRun`, for the optional-hook
  // reason the control row's header states: `importFile.useRun` exists only where the field does.
  return door === undefined ? <ActionsOverflow actions={actions} /> : <ImportOverflow actions={actions} door={door} />;
}

/** One declared library verb as a menu item. Its own component so `useRun` is unconditional for its own
 *  fiber, and so the `actions` array's fixed order is the fixed hook order. */
function ActionItem({ action }: { readonly action: NonNullable<CollectionContribution["actions"]>[number] }): ReactElement {
  const run = action.useRun();
  return (
    // THE HOUSE'S DESTRUCTIVE MENU GRAMMAR, not a new one: `RowActionsMenu` marks its destructive arm with
    // the `Trash2` glyph behind a separator, and `MenuItem` has no intent prop to reach for. One vocabulary
    // for "this one deletes", whether the subject is a row or the whole library.
    <MenuItem onClick={run}>
      {action.tone === "danger" ? <Icon icon={Trash2} size="sm" /> : null}
      {action.label}
    </MenuItem>
  );
}

function ActionItems({ actions }: { readonly actions: NonNullable<CollectionContribution["actions"]> }): ReactElement {
  return (
    <>
      {actions.map((action) => (
        <ActionItem action={action} key={action.label} />
      ))}
    </>
  );
}

/** The overflow for a library with actions and NO import door — no `FileTrigger` to wrap. */
function ActionsOverflow({ actions }: { readonly actions: NonNullable<CollectionContribution["actions"]> }): ReactElement {
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button aria-label="More library actions" intent="ghost" size="icon-sm">
            <Icon icon={MoreVertical} size="sm" />
          </Button>
        }
      />
      <MenuPopup align="end">
        <ActionItems actions={actions} />
      </MenuPopup>
    </Menu>
  );
}

function ImportOverflow({
  door,
  actions,
}: {
  readonly door: NonNullable<CollectionContribution["importFile"]>;
  readonly actions: NonNullable<CollectionContribution["actions"]>;
}): ReactElement {
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
            {actions.length === 0 ? null : <MenuSeparator />}
            <ActionItems actions={actions} />
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
