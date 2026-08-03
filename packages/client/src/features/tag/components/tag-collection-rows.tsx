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

import type { TagWithUsage } from "@orb/contracts/tag";
import type { TagId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { SortableList } from "@orb/ui/sortable";
import { Text } from "@orb/ui/text";
import { VirtualList } from "@orb/ui/virtual-list";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { LibraryRow } from "#components";
import { useInvalidation, useTRPC } from "#data";
import type { CollectionListView } from "#lib";
import { COLLECTION_LARGE_GROUP } from "#lib";
import { usePruneUnusedTags, useSetTagOrder } from "../hooks/use-tag-settings-mutations";
import { usageTotalLabel } from "../lib/tags-model";

/** One compact row's height guess for the windowed arm (swatch + name + usage on one line). */
const ESTIMATED_ROW_PX = 36;

export function TagCollectionRows({ view }: { readonly view: CollectionListView }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: tags } = useSuspenseQuery(trpc.tag.listTagsWithUsage.queryOptions());
  const setOrder = useSetTagOrder({ trpc, invalidation });
  const prune = usePruneUnusedTags({ trpc, invalidation });

  const needle = view.filter.trim().toLowerCase();
  const filtered = needle === "" ? tags : tags.filter((tag) => tag.name.toLowerCase().includes(needle));
  const hasUnused = tags.some((tag) => tag.usage.total === 0);

  const renderRow = (tag: TagWithUsage): ReactElement => (
    <TagCollectionRow key={tag.id} onSelect={(): void => view.onSelect(tag.id)} selected={view.selectedId === tag.id} tag={tag} />
  );

  const windowed = tags.length > COLLECTION_LARGE_GROUP;
  const empty = filtered.length === 0;
  return (
    <Stack gap="tight">
      {empty ? <Text voice="gloss">No tags match that filter.</Text> : null}
      {empty || !windowed ? null : (
        <VirtualList
          aria-label="Tags"
          className="max-h-96"
          estimateSize={(): number => ESTIMATED_ROW_PX}
          gapToken="field"
          getItemKey={(tag): string => tag.id}
          items={filtered}
          renderItem={renderRow}
        />
      )}
      {empty || windowed ? null : (
        <SortableList
          getItemKey={(tag: TagWithUsage): string => tag.id}
          handle={true}
          items={filtered}
          onReorder={(orderedKeys): void => setOrder.mutate({ orderedIds: orderedKeys.map((key) => key as TagId) })}
          renderItem={renderRow}
        />
      )}
      {/* The library-level verb rides the OWNER's half of the group body — the host's band carries only the
          create verb, and "prune" is a fact about this library nobody else can state. */}
      {hasUnused ? (
        <Row justify="end">
          <Button intent="ghost" onClick={(): void => prune.mutate()} size="sm" type="button">
            Prune unused
          </Button>
        </Row>
      ) : null}
    </Stack>
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
