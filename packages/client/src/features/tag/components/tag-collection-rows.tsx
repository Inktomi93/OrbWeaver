// The Labels finder owns destructive decisions so a bus refresh cannot remove an active confirm.
import type { TagWithUsage } from "@orb/contracts/tag";
import type { TagId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { ColorSwatch } from "@orb/ui/color-field";
import { Icon, Trash2 } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { MenuItem } from "@orb/ui/menu";
import { SortableList } from "@orb/ui/sortable";
import { Text } from "@orb/ui/text";
import { VirtualList } from "@orb/ui/virtual-list";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { ConfirmDialog, LibraryRow, usePruneUnusedTags, useRemoveTag, useSetTagOrder } from "#components";
import type { Invalidation, Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { COLLECTION_LARGE_GROUP, pruneConfirmLabel, sortTagsBy, tagColorLabel, tagUsageLabel, unusedTagsLabel, usageBreakdown } from "#lib";
import { labelDeleted, setLabelFilter, setTagPruneConfirmOpen, useTagPruneConfirmOpen, useTagSortMode } from "#state";
import { finderRoot, libraryOrFinder } from "../lib/labels-focus-targets.ts";

const ESTIMATED_ROW_PX = 52;

interface TagRowsView {
  readonly selectedId: TagId | null;
  readonly onSelect: (tagId: TagId) => void;
  readonly filter: string;
}

export function TagCollectionRows({ view }: { readonly view: TagRowsView }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: tags } = useSuspenseQuery(trpc.tag.listTagsWithUsage.queryOptions());
  const setOrder = useSetTagOrder({ trpc, invalidation });
  const deletion = useLabelDelete({ trpc, invalidation }, view.selectedId);
  const sortMode = useTagSortMode();
  const needle = view.filter.trim().toLowerCase();
  const matched = needle === "" ? tags : tags.filter((tag) => tag.name.toLowerCase().includes(needle));
  const filtered = sortTagsBy(matched, sortMode);
  const renderRow = (tag: TagWithUsage): ReactElement => (
    <Stack data-label-row={tag.id} key={tag.id}>
      <TagCollectionRow
        onDelete={(): void => deletion.requestDelete(tag)}
        onSelect={(): void => view.onSelect(tag.id)}
        selected={view.selectedId === tag.id}
        tag={tag}
      />
    </Stack>
  );

  const windowed = tags.length > COLLECTION_LARGE_GROUP;
  const draggable = !windowed && sortMode === "manual";
  const empty = filtered.length === 0;
  const filterMiss = empty && needle !== "";
  return (
    <Stack className="min-h-0 flex-1" gap="tight">
      {filterMiss ? (
        <Stack align="start" gap="field">
          <Text role="status" voice="gloss">
            No labels match that filter.
          </Text>
          <Button
            intent="secondary"
            size="sm"
            onClick={(): void => {
              setLabelFilter("");
              finderRoot()?.querySelector<HTMLInputElement>("input")?.focus();
            }}
          >
            Clear filter
          </Button>
        </Stack>
      ) : null}
      {empty || !windowed ? null : (
        <VirtualList
          aria-label="Labels"
          className="min-h-0 flex-1"
          estimateSize={(): number => ESTIMATED_ROW_PX}
          fadeEdge={true}
          gapToken="field"
          getItemKey={(tag): string => tag.id}
          items={filtered}
          renderItem={renderRow}
        />
      )}
      {empty || !draggable ? null : (
        <SortableList
          aria-label="Labels"
          getItemKey={(tag: TagWithUsage): string => tag.id}
          handle={true}
          itemLabel={(tag: TagWithUsage): string => tag.name}
          items={filtered}
          onReorder={(orderedKeys): void => setOrder.mutate({ orderedIds: orderedKeys.map((key) => key as TagId) })}
          renderItem={renderRow}
        />
      )}

      {empty || windowed || draggable ? null : (
        <Stack aria-label="Labels" gap="field" role="list">
          {filtered.map((tag, index) => (
            <Stack aria-posinset={index + 1} aria-setsize={filtered.length} key={tag.id} role="listitem">
              {renderRow(tag)}
            </Stack>
          ))}
        </Stack>
      )}

      <LabelsPruneConfirm tags={tags} deps={{ trpc, invalidation }} />
      {deletion.dialog}
    </Stack>
  );
}

function LabelsPruneConfirm({
  tags,
  deps,
}: {
  readonly tags: readonly TagWithUsage[];
  readonly deps: { readonly trpc: Trpc; readonly invalidation: Invalidation };
}): ReactElement {
  const prune = usePruneUnusedTags(deps);
  const pruneOpen = useTagPruneConfirmOpen();
  const [pruneDecision, setPruneDecision] = useState({ open: pruneOpen, completed: false, revision: 0 });
  if (pruneDecision.open !== pruneOpen) {
    setPruneDecision({
      open: pruneOpen,
      completed: pruneOpen ? false : pruneDecision.completed,
      revision: pruneOpen ? pruneDecision.revision + 1 : pruneDecision.revision,
    });
  }

  const activePruneDecision = useRef(pruneDecision);
  useLayoutEffect(() => {
    activePruneDecision.current = pruneDecision;
  }, [pruneDecision]);
  const movePruneOpen = (open: boolean): void => {
    if (activePruneDecision.current.revision === pruneDecision.revision && activePruneDecision.current.open) {
      setTagPruneConfirmOpen(open);
    }
  };
  const unused = tags.filter((tag) => tag.usage.total === 0 && tag.pendingSuggestions === 0);
  const unusedCount = unused.length;
  const hasUnused = unusedCount > 0;

  const onPrune = async (): Promise<void> => {
    await prune.mutateAsync();
    setPruneDecision((current) => (current === pruneDecision ? { ...current, completed: true } : current));
  };
  const pruneFinalFocus = (): boolean => {
    if (!pruneDecision.completed) {
      return true;
    }
    const target = libraryOrFinder();
    target?.focus();
    return document.activeElement !== target;
  };
  return (
    <ConfirmDialog
      key={pruneDecision.revision}
      body={
        hasUnused ? (
          <VirtualList
            aria-label="Labels to delete"
            // @orb-waive ui-size-via-variant(h-64): VirtualList has no sealed size; its contract requires caller-owned bounded height through className.
            className="h-64"
            estimateSize={(): number => ESTIMATED_ROW_PX}
            getItemKey={(tag): string => tag.id}
            items={unused}
            renderItem={(tag): ReactElement => <Text>{tag.name}</Text>}
          />
        ) : null
      }
      confirmDisabled={!hasUnused}
      confirmLabel={pruneConfirmLabel(unusedCount)}
      description={
        hasUnused
          ? `This deletes ${unusedTagsLabel(unusedCount)} — every label attached to nothing. This can't be undone.`
          : "Every label in this library is attached to something, so there is nothing to delete."
      }
      finalFocus={pruneFinalFocus}
      onConfirm={onPrune}
      onOpenChange={movePruneOpen}
      open={pruneOpen}
      title={hasUnused ? `Delete ${unusedTagsLabel(unusedCount)}?` : "Nothing to prune"}
    />
  );
}

function useLabelDelete(
  deps: { readonly trpc: Trpc; readonly invalidation: Invalidation },
  selectedId: TagId | null,
): {
  readonly requestDelete: (tag: TagWithUsage) => void;
  readonly dialog: ReactElement;
} {
  const remove = useRemoveTag(deps);
  const [decision, setDecision] = useState<{
    readonly revision: number;
    readonly tag: TagWithUsage;
    readonly wasOpen: boolean;
    readonly opener: HTMLElement | null;
    readonly open: boolean;
    readonly completed: boolean;
  } | null>(null);
  const requestDelete = (tag: TagWithUsage): void => {
    const opener = document.querySelector<HTMLElement>(`[data-label-row="${tag.id}"] [data-slot="list-row-actions"] button`);
    setDecision((current) => ({ revision: (current?.revision ?? 0) + 1, tag, wasOpen: selectedId === tag.id, opener, open: true, completed: false }));
  };
  const onDelete = async (): Promise<void> => {
    if (decision === null) {
      return;
    }
    await remove.mutateAsync({ tagId: decision.tag.id });
    labelDeleted(decision.tag.id);
    setDecision((current) => (current === decision ? { ...decision, completed: true } : current));
  };
  const deleteFinalFocus = (): boolean => {
    if (decision === null) {
      return true;
    }
    let target = finderRoot();
    if (decision.completed && decision.wasOpen) {
      target = libraryOrFinder();
    } else if (!decision.completed && decision.opener?.isConnected === true) {
      target = decision.opener;
    }
    target?.focus();
    return document.activeElement !== target;
  };
  return {
    requestDelete,
    dialog: (
      <ConfirmDialog
        key={decision?.revision ?? 0}
        title={decision === null ? "Delete label?" : `Delete "${decision.tag.name}"?`}
        description={
          decision === null
            ? "Deleting removes every attachment and cannot be undone."
            : `This removes the label from ${usageBreakdown(decision.tag.usage)} and can't be undone.`
        }
        confirmLabel="Delete"
        open={decision?.open ?? false}
        onOpenChange={(open): void =>
          setDecision((current) => {
            if (current === null || current.revision !== decision?.revision) {
              return current;
            }
            return { ...current, open };
          })
        }
        onConfirm={onDelete}
        finalFocus={deleteFinalFocus}
      />
    ),
  };
}

function TagCollectionRow({
  tag,
  selected,
  onSelect,
  onDelete,
}: {
  readonly tag: TagWithUsage;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onDelete: () => void;
}): ReactElement {
  return (
    <LibraryRow
      actions={{
        name: tag.name,
        menuItemsAfter: (
          <MenuItem onClick={onDelete}>
            <Icon icon={Trash2} size="sm" />
            Delete
          </MenuItem>
        ),
      }}
      // Decorative in the row's spoken form (the census is its description); the colour is stated in words in
      // the editor the row opens. `null` paints the swatch's own unset state, never a colour.
      leading={<ColorSwatch aria-hidden={true} size="sm" title={tagColorLabel("Background", tag.color)} value={tag.color} />}
      onSelect={onSelect}
      selected={selected}
      subtitle={tagUsageLabel(tag)}
      title={tag.name}
    />
  );
}
