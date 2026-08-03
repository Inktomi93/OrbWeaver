// The tag collection's ROWS — the OWNER half of the config-rail seam (F-5: the host draws the group frame,
// the contribution draws everything inside it).
//
// THE ROW IS A SCENT NOW, NOT A CONTROL PANEL (F-11, owner-ruled). Every tag control used to live INSIDE
// the settings row — rename, two colour pickers, a folder Select, a hide Switch, Merge and Delete, all on
// one 330px-wide line. That anatomy cannot survive in a roster pane, and it was never good: the row is the
// thing you SCAN (swatch · name · usage), and the controls are the thing you EDIT, which is now a mounted
// member editor in CONTENT. No capability was dropped — every control moved, one pane over.
//
// TWO RENDER ARMS BY SIZE (owner ruling 2026-08-02: ~400 tags is the real library):
//   ≤ COLLECTION_LARGE_GROUP → a `SortableList`, because manual tag ORDER is a real affordance at that size;
//   >  COLLECTION_LARGE_GROUP → the sealed `VirtualList` in a bounded box, plus the host's filter.
// Drag-reorder is absent in the virtualized arm — dragging one row through four hundred is not an
// affordance, and the two cannot compose (a windowed list has no stable drop target for an unrendered
// row). FLAGGED for the owner as the one capability whose shape changes with library size.
//
// SORT MODE (tag-experience audit 2026-08-03): the roster reads in one of three orders — Most used
// (DEFAULT), A–Z, Manual order — persisted per device in the `tag-library` store. The counts are already in
// every payload (`listOwnedTagsWithUsage` returns `usage.total`), so this is a client comparator and a
// Select, with zero server cost.
//
// DRAG BELONGS TO MANUAL ONLY. `sortOrder` KEEPS its three server-side readers (owner ruling: manual is not
// retired, the new modes JOIN it) — but a drag handle inside a DERIVED order would write a `sortOrder` the
// screen never reflects, which is a control that lies. So the ≤30 arm forks again: manual → `SortableList`,
// the two derived modes → the same rows without handles.

import type { TagWithUsage } from "@orb/contracts/tag";
import type { TagId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { SortableList } from "@orb/ui/sortable";
import { Text } from "@orb/ui/text";
import { VirtualList } from "@orb/ui/virtual-list";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ConfirmDialog, LibraryRow } from "#components";
import { useInvalidation, useTRPC } from "#data";
import type { CollectionListView } from "#lib";
import { COLLECTION_LARGE_GROUP, COLLECTION_WINDOW_MAX_HEIGHT, sortTagsBy } from "#lib";
import { setTagSortMode, useTagSortMode } from "#state";
import { usePruneUnusedTags, useSetTagOrder } from "../hooks/use-tag-settings-mutations";
import { TAG_SORT_ITEMS, unusedTagsLabel, usageTotalLabel } from "../lib/tags-model";

/** One compact row's height guess for the windowed arm (swatch + name + usage on one line). */
const ESTIMATED_ROW_PX = 36;

export function TagCollectionRows({ view }: { readonly view: CollectionListView }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: tags } = useSuspenseQuery(trpc.tag.listTagsWithUsage.queryOptions());
  const setOrder = useSetTagOrder({ trpc, invalidation });
  const prune = usePruneUnusedTags({ trpc, invalidation });
  const sortMode = useTagSortMode();

  const needle = view.filter.trim().toLowerCase();
  const matched = needle === "" ? tags : tags.filter((tag) => tag.name.toLowerCase().includes(needle));
  const filtered = sortTagsBy(matched, sortMode);
  const unusedCount = tags.filter((tag) => tag.usage.total === 0).length;
  const hasUnused = unusedCount > 0;

  const renderRow = (tag: TagWithUsage): ReactElement => (
    <TagCollectionRow key={tag.id} onSelect={(): void => view.onSelect(tag.id)} selected={view.selectedId === tag.id} tag={tag} />
  );

  const windowed = tags.length > COLLECTION_LARGE_GROUP;
  const draggable = !windowed && sortMode === "manual";
  const empty = filtered.length === 0;
  // A FILTER MISS AND AN EMPTY LIBRARY ARE DIFFERENT STATES (side-eye 2026-08-03 P1). `filtered.length === 0`
  // printed "No tags match that filter." with no filter set — and stacked it above the host's own zero-member
  // slot, so an empty collection said two things, one of them false (the filter box isn't even rendered
  // below COLLECTION_LARGE_GROUP). The needle is the discriminant; with no needle the host's empty slot is
  // the only voice.
  const filterMiss = empty && needle !== "";
  return (
    <Stack gap="tight">
      {/* The order control rides the OWNER's half of the group body (the host's band carries only create),
          and only where there is an order to change — a one-tag library has none. */}
      {tags.length > 1 ? (
        <Row justify="end">
          <Select
            aria-label="Sort tags"
            className="w-auto"
            items={TAG_SORT_ITEMS}
            onValueChange={(value): void => {
              if (value !== null) {
                setTagSortMode(value);
              }
            }}
            value={sortMode}
          />
        </Row>
      ) : null}
      {filterMiss ? <Text voice="gloss">No tags match that filter.</Text> : null}
      {empty || !windowed ? null : (
        <VirtualList
          aria-label="Tags"
          className={COLLECTION_WINDOW_MAX_HEIGHT}
          estimateSize={(): number => ESTIMATED_ROW_PX}
          gapToken="field"
          getItemKey={(tag): string => tag.id}
          items={filtered}
          renderItem={renderRow}
        />
      )}
      {empty || !draggable ? null : (
        <SortableList
          getItemKey={(tag: TagWithUsage): string => tag.id}
          handle={true}
          handleLabel={(tag: TagWithUsage): string => `Reorder ${tag.name}`}
          items={filtered}
          onReorder={(orderedKeys): void => setOrder.mutate({ orderedIds: orderedKeys.map((key) => key as TagId) })}
          renderItem={renderRow}
        />
      )}
      {/* The DERIVED orders below the windowing cap: the same rows, no handles (see the header) — a plain
          Stack rather than a second list role, because the rows are the list. */}
      {empty || windowed || draggable ? null : <Stack gap="field">{filtered.map(renderRow)}</Stack>}
      {/* The library-level verb rides the OWNER's half of the group body — the host's band carries only the
          create verb, and "prune" is a fact about this library nobody else can state.
          IT CONFIRMS (side-eye 2026-08-03 P2): it was a bare `prune.mutate()` on a ghost button sitting one
          row under a virtualized list — at the owner's 430-tag library that is a single mis-click from
          deleting 394 rows with no undo. Every other destructive verb in this workspace already carries a
          ConfirmDialog; the count goes IN the copy, because "delete unused tags" and "delete 394 tags" are
          different decisions. */}
      {hasUnused ? <PruneUnusedControl count={unusedCount} onConfirm={(): void => prune.mutate()} /> : null}
    </Stack>
  );
}

/** "Prune unused" + its confirm — the mass-delete's one door (the ConfirmDialog homing precedent). */
function PruneUnusedControl({ count, onConfirm }: { readonly count: number; readonly onConfirm: () => void }): ReactElement {
  return (
    <Row justify="end">
      <ConfirmDialog
        confirmLabel="Delete them"
        description={`This deletes ${unusedTagsLabel(count)} — every tag attached to nothing. This can't be undone.`}
        onConfirm={onConfirm}
        title={`Delete ${unusedTagsLabel(count)}?`}
        trigger={
          <Button intent="ghost" size="sm" type="button">
            Prune unused
          </Button>
        }
      />
    </Row>
  );
}

/** One tag row: the colour swatch, the name, and the usage census — what you SCAN a library by. */
function TagCollectionRow({
  tag,
  selected,
  onSelect,
}: {
  readonly tag: TagWithUsage;
  readonly selected: boolean;
  readonly onSelect: () => void;
}): ReactElement {
  return (
    <LibraryRow
      leading={
        // The tag's own colour is USER DATA, not a token — the one legal inline style (a dynamic value the
        // token gates deliberately scope out), and it rides a layout primitive because a feature may not
        // put `style` on a raw intrinsic.
        <Row
          aria-hidden={true}
          className="size-3 shrink-0 rounded-control bg-muted"
          {...(tag.color === null ? {} : { style: { backgroundColor: tag.color } })}
        />
      }
      markers={
        <Text as="span" voice="datum">
          {usageTotalLabel(tag.usage.total)}
        </Text>
      }
      onSelect={onSelect}
      selected={selected}
      title={tag.name}
    />
  );
}
