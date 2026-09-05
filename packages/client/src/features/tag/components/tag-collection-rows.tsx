// The tag collection's ROWS — the OWNER half of the config-rail seam (F-5: the host draws the group frame,
// the contribution draws everything inside it).
//
// THE ROW IS A SCENT NOW, NOT A CONTROL PANEL (F-11, owner-ruled). Every tag control used to live INSIDE
// the settings row — rename, two colour pickers, a folder Select, a hide Switch, Merge and Delete, all on
// one 330px-wide line. That anatomy cannot survive in a list pane, and it was never good: the row is the
// thing you SCAN (swatch · name · usage), and the controls are the thing you EDIT, which is now a mounted
// member editor in CONTENT. No capability was dropped — every control moved, one pane over.
//
// …EXCEPT DELETE, WHICH IS THE ROW'S KEBAB NOW (config-delete convergence #271). THE F-11 RULING SURVIVES —
// its INPUT changed. F-11 killed the INLINE 330px control panel; a kebab Delete is not that. It is the
// house's per-row destructive affordance (`LibraryRow.actions.onDelete` → the shared RowActionsMenu confirm),
// the SAME place world-info and regex rows home Delete, and it is width-free — it floats at the row's end,
// hover/focus-revealed, and never steals the scan column's width. So "the row is a scan line" holds: the
// swatch/name/usage anatomy is untouched, and the one verb that was living TWO homes across these three
// surfaces (WI row-kebab-only, regex both, tags editor-only) now has ONE. The EDITING controls (rename,
// colours, folder, hide, Merge) stay in the member editor where F-11 put them — only Delete converged.
//
// TWO RENDER ARMS BY SIZE (owner ruling 2026-08-02: ~400 tags is the real library):
//   ≤ COLLECTION_LARGE_GROUP → a `SortableList`, because manual tag ORDER is a real affordance at that size;
//   >  COLLECTION_LARGE_GROUP → the sealed `VirtualList` in a bounded box, plus the host's filter.
// Drag-reorder is absent in the virtualized arm — dragging one row through four hundred is not an
// affordance, and the two cannot compose (a windowed list has no stable drop target for an unrendered
// row). FLAGGED for the owner as the one capability whose shape changes with library size.
//
// SORT MODE (tag-experience audit 2026-08-03): the list reads in one of three orders — Most used
// (DEFAULT), A–Z, Manual order — persisted per device in the `tag-library` store. The counts are already in
// every payload (`listOwnedTagsWithUsage` returns `usage.total`), so this is a client comparator and a
// Select, with zero server cost.
//
// DRAG BELONGS TO MANUAL ONLY. `sortOrder` KEEPS its three server-side readers (owner ruling: manual is not
// retired, the new modes JOIN it) — but a drag handle inside a DERIVED order would write a `sortOrder` the
// screen never reflects, which is a control that lies. So the ≤30 arm forks again: manual → `SortableList`,
// the two derived modes → the same rows without handles.
//
// …AND THE LIST SAYS ALL OF THAT OUT LOUD NOW (side-eye 2026-08-03 P1/P2). Three silences, one line and
// one `disabled` between them: above the cap "Manual order" was a fully selectable mode with zero handles
// whose output is pixel-identical to A–Z (every `sortOrder` is null, so the comparator tiebreaks on name)
// and it PERSISTS, so a user could sit in it forever; below the cap nothing told anyone that dragging
// existed at all, because it lives behind a third option in a right-aligned Select that reads as a view
// preference; and the Select itself sat alone on its line with ~230px of dead space beside it. The hint
// (`tagOrderHint`) is the list's voice for the first two and the Select's row-mate for the third.

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
import { clearCollectionSelection, setTagSortMode, useTagSortMode } from "#state";
import { usePruneUnusedTags, useRemoveTag, useSetTagOrder } from "../hooks/use-tag-settings-mutations.ts";
import { pruneConfirmLabel, tagColorLabel, tagOrderHint, tagSortItems, unusedTagsLabel, usageBreakdown, usageTotalLabel } from "../lib/tags-model.ts";

/** One compact row's height guess for the windowed arm (swatch + name + usage on one line). */
const ESTIMATED_ROW_PX = 36;

export function TagCollectionRows({ view }: { readonly view: CollectionListView }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: tags } = useSuspenseQuery(trpc.tag.listTagsWithUsage.queryOptions());
  const setOrder = useSetTagOrder({ trpc, invalidation });
  const prune = usePruneUnusedTags({ trpc, invalidation });
  const remove = useRemoveTag({ trpc, invalidation });
  const sortMode = useTagSortMode();

  const needle = view.filter.trim().toLowerCase();
  const matched = needle === "" ? tags : tags.filter((tag) => tag.name.toLowerCase().includes(needle));
  const filtered = sortTagsBy(matched, sortMode);
  const unusedCount = tags.filter((tag) => tag.usage.total === 0).length;
  const hasUnused = unusedCount > 0;

  // Delete is the row's KEBAB now (config-delete #271). Clear the selection FIRST when the open tag is the
  // one being deleted, so CONTENT falls back to the workspace welcome instead of holding a dead editor over a
  // deleted id — the world-info/regex row rule, and what the member editor's own delete did before this.
  const onDelete = (id: TagId): void => {
    if (view.selectedId === id) {
      clearCollectionSelection();
    }
    remove.mutate({ tagId: id });
  };

  const renderRow = (tag: TagWithUsage): ReactElement => (
    <TagCollectionRow key={tag.id} onDelete={onDelete} onSelect={(): void => view.onSelect(tag.id)} selected={view.selectedId === tag.id} tag={tag} />
  );

  const windowed = tags.length > COLLECTION_LARGE_GROUP;
  const draggable = !windowed && sortMode === "manual";
  const orderHint = tagOrderHint(!windowed, sortMode, COLLECTION_LARGE_GROUP);
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
        // The Select SHARES this line with the order hint. Alone on it, right-aligned with ~230px of dead
        // space beside it, it read as a leftover control (side-eye 2026-08-03 P2) — and the list had no
        // voice at all for the one thing the third mode is FOR.
        <Row align="center" gap="tight" justify="between">
          {orderHint === null ? null : (
            <Text className="min-w-0 flex-1" voice="gloss">
              {orderHint}
            </Text>
          )}
          <Select
            aria-label="Sort tags"
            className="w-auto"
            items={tagSortItems(!windowed)}
            onValueChange={(value): void => {
              if (value !== null) {
                setTagSortMode(value);
              }
            }}
            value={sortMode}
          />
        </Row>
      ) : null}
      {/* THE MISS SPEAKS (side-eye 2026-08-19 P3). Focus stays in the host's filter box while the rows below
          it change, so the one state with no rows at all had no feedback a keyboard reader ever received.
          `role="status"` is the polite live region for exactly this. It rides the MESSAGE, not the row
          container: a live region wrapped around the list would announce all 400 rows on every keystroke. */}
      {filterMiss ? (
        <Text role="status" voice="gloss">
          No tags match that filter.
        </Text>
      ) : null}
      {empty || !windowed ? null : (
        <VirtualList
          aria-label="Tags"
          className={COLLECTION_WINDOW_MAX_HEIGHT}
          estimateSize={(): number => ESTIMATED_ROW_PX}
          // The bounded window ends mid-row at an arbitrary height, and with overlay scrollbars that
          // half-row is the only hint that there is more (side-eye 2026-08-03 P3). The fade lifts at the
          // bottom, so it never claims more than there is.
          fadeEdge={true}
          gapToken="field"
          getItemKey={(tag): string => tag.id}
          items={filtered}
          renderItem={renderRow}
        />
      )}
      {empty || !draggable ? null : (
        <SortableList
          aria-label="Tags"
          getItemKey={(tag: TagWithUsage): string => tag.id}
          handle={true}
          itemLabel={(tag: TagWithUsage): string => tag.name}
          items={filtered}
          onReorder={(orderedKeys): void => setOrder.mutate({ orderedIds: orderedKeys.map((key) => key as TagId) })}
          renderItem={renderRow}
        />
      )}
      {/* The DERIVED orders below the windowing cap: the same rows, no handles (see the header). LIST
          SEMANTICS are explicit here (side-eye 2026-08-06 P2) — the two sibling arms of this very component
          are a `VirtualList` and a `SortableList`, both of which announce "list, N items", so the third arm
          announcing nothing made the SAME library speak two a11y grammars depending on its sort mode. */}
      {empty || windowed || draggable ? null : (
        <Stack aria-label="Tags" gap="field" role="list">
          {filtered.map((tag, index) => (
            <Stack aria-posinset={index + 1} aria-setsize={filtered.length} key={tag.id} role="listitem">
              {renderRow(tag)}
            </Stack>
          ))}
        </Stack>
      )}
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
function PruneUnusedControl({ count, onConfirm }: { readonly count: number; readonly onConfirm: () => void | Promise<void> }): ReactElement {
  return (
    <Row justify="end">
      <ConfirmDialog
        confirmLabel={pruneConfirmLabel(count)}
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

/** One tag row: the colour swatch, the name, and the usage census — what you SCAN a library by, plus the
 *  kebab Delete (config-delete #271 — the row's one lifecycle verb; the editing controls stay in the member
 *  editor per F-11). The confirm carries the real cascade copy the member editor's delete used to. */
function TagCollectionRow({
  tag,
  selected,
  onSelect,
  onDelete,
}: {
  readonly tag: TagWithUsage;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onDelete: (id: TagId) => void;
}): ReactElement {
  return (
    <LibraryRow
      actions={{
        name: tag.name,
        onDelete: (): void => onDelete(tag.id),
        deleteDescription: `This removes the tag from ${usageBreakdown(tag.usage)} and can't be undone.`,
      }}
      leading={
        // The tag's own colour is USER DATA, not a token — the one legal inline style (a dynamic value the
        // token gates deliberately scope out), and it rides a layout primitive because a feature may not
        // put `style` on a raw intrinsic.
        //
        // A hover TOOLTIP and nothing else. `ListRow` wraps its whole `leading` slot in `aria-hidden` by
        // construction (the fallback-initials rule), so a name spelled here could never reach the a11y tree.
        //
        // AND THE VALUE DOES NOT BELONG ON THE ROW AT ALL (side-eye re-verify 2026-08-06). The first pass
        // routed it through `markers`, which is the row's `aria-describedby` channel — so a screen-reader
        // user scanning a 32-row list heard an 8-word colour disclaimer THIRTY-TWO TIMES, ahead of the
        // census they were scanning for, and concatenated to it with no separator ("…theme default5 uses":
        // the adjacent-inline-node trap `chat-documents-section.tsx:172-175` guards with a literal space).
        // A list row is a SCAN line — swatch, name, usage. The colour's exact value is an EDITING fact and
        // it is stated once, in words, in the editor the row's own click mounts (`tag-member-surface.tsx`).
        <Row
          aria-hidden={true}
          className="size-3 shrink-0 rounded-control bg-muted"
          title={tagColorLabel("Background", tag.color)}
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
