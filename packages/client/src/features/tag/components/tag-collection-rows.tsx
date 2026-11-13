// The Labels finder owns destructive decisions so a bus refresh cannot remove an active confirm.
import type { TagWithUsage } from "@orb/contracts/tag";
import type { TagId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { ColorSwatch } from "@orb/ui/color-field";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Search, Tag, Trash } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { MenuItem } from "@orb/ui/menu";
import { SortableList } from "@orb/ui/sortable";
import { Text } from "@orb/ui/text";
import type { VirtualListHandle } from "@orb/ui/virtual-list";
import { VirtualList } from "@orb/ui/virtual-list";
import type { ReactElement, RefCallback } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import type { ConfirmedAction } from "#components";
import { ConfirmDialog, LibraryRow, usePruneUnusedTags, useRemoveTag, useRowDeleteFocus, useSetTagOrder } from "#components";
import type { Invalidation, Trpc } from "#data";
import { useInvalidation, useSuspenseQuery, useTRPC } from "#data";
import {
  CLEAR_FILTER_NAME,
  COLLECTION_LARGE_GROUP,
  deleteConfirmTitle,
  ESTIMATED_ROW_PX,
  LABELS_NONE,
  NO_MATCHES_TITLE,
  pruneConfirmLabel,
  sortTagsBy,
  tagUsageLabel,
  unusedTagsLabel,
  usageBreakdown,
} from "#lib";
import { confirmedAction } from "#src/components/confirmed-action.ts";
import { labelDeleted, setLabelFilter, setTagPruneConfirmOpen, useTagPruneConfirmOpen, useTagSortMode } from "#state";
import { finderRoot, focusAfterConfirmCloses, focusFinderSearch, labelRowOpener, libraryOrFinder } from "../lib/labels-focus-targets.ts";
import { TAG_LIST_NAME } from "../lib/tag-list-name.ts";

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
  // The finder's rows take focus back by key, whichever container holds them: across the swap between the drag list and the
  // window at the cap, and on the Back from the tag a row opened. The root is where focus lands when no row can take it.
  const listRootRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<VirtualListHandle>(null);
  const rowFocus = useRowDeleteFocus(
    listRootRef,
    filtered.map((tag) => tag.id),
    windowRef,
  );
  const renderRow = (tag: TagWithUsage): ReactElement => (
    <Stack data-label-row={tag.id} key={tag.id}>
      <TagCollectionRow
        bodyRef={rowFocus.bodyRef(tag.id)}
        onDelete={deletion.requestDelete(tag)}
        onSelect={(): void => view.onSelect(tag.id)}
        selected={view.selectedId === tag.id}
        tag={tag}
      />
    </Stack>
  );

  // Drag handles cannot live in a window, so the manual order drags only while the whole library fits one list; every other
  // reading order is the window at every size.
  const draggable = sortMode === "manual" && tags.length <= COLLECTION_LARGE_GROUP;
  const empty = filtered.length === 0;
  const filterMiss = empty && needle !== "";
  return (
    <Stack focusTarget={true} grow={true} gap="tight" ref={listRootRef} tabIndex={-1}>
      {filterMiss ? (
        <EmptyState
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={(): void => {
                setLabelFilter("");
                focusFinderSearch();
              }}
            >
              {CLEAR_FILTER_NAME}
            </Button>
          }
          description="No tags match that filter."
          icon={<Icon icon={Search} size="lg" />}
          title={NO_MATCHES_TITLE}
        />
      ) : null}
      {empty && !filterMiss ? (
        // No action: the finder's band carries the one New tag, and one verb on one screen is the ruled count.
        <EmptyState action={null} icon={<Icon icon={Tag} size="lg" />} title={LABELS_NONE} />
      ) : null}
      {empty || draggable ? null : (
        <VirtualList
          aria-label={TAG_LIST_NAME}
          grow={true}
          estimateSize={(): number => ESTIMATED_ROW_PX.subtitled}
          fadeEdge={true}
          gapToken="field"
          getItemKey={(tag): string => tag.id}
          items={filtered}
          ref={windowRef}
          renderItem={renderRow}
        />
      )}
      {empty || !draggable ? null : (
        <SortableList
          aria-label={TAG_LIST_NAME}
          getItemKey={(tag: TagWithUsage): string => tag.id}
          handle={true}
          itemLabel={(tag: TagWithUsage): string => tag.name}
          items={filtered}
          onReorder={(orderedKeys): void => setOrder.mutate({ orderedIds: orderedKeys.map((key) => typeIdSchema(ID_PREFIX.tag).parse(key)) })}
          renderItem={renderRow}
        />
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
  const prune = usePruneUnusedTags({ ...deps, failureShownInline: "the prune-tags confirm's alert line" });
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
    return focusAfterConfirmCloses(libraryOrFinder());
  };
  return (
    <ConfirmDialog
      key={pruneDecision.revision}
      body={
        hasUnused ? (
          <VirtualList
            aria-label="Tags to delete"
            height="scrollMd"
            estimateSize={(): number => ESTIMATED_ROW_PX.subtitled}
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
          ? `This deletes ${unusedTagsLabel(unusedCount)}: every tag attached to nothing. This can't be undone.`
          : "Every tag in this library is attached to something, so there is nothing to delete."
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
  /** The opener of this hook's delete confirm for one tag. */
  readonly requestDelete: (tag: TagWithUsage) => ConfirmedAction;
  readonly dialog: ReactElement;
} {
  const remove = useRemoveTag({ ...deps, failureShownInline: "the delete-tag confirm's alert line" });
  const [decision, setDecision] = useState<{
    readonly revision: number;
    readonly tag: TagWithUsage;
    readonly wasOpen: boolean;
    readonly opener: HTMLElement | null;
    readonly open: boolean;
    readonly completed: boolean;
  } | null>(null);
  const requestDelete = (tag: TagWithUsage): ConfirmedAction =>
    confirmedAction((): void => {
      const opener = labelRowOpener(tag.id);
      setDecision((current) => ({ revision: (current?.revision ?? 0) + 1, tag, wasOpen: selectedId === tag.id, opener, open: true, completed: false }));
    });
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
    return focusAfterConfirmCloses(target);
  };
  return {
    requestDelete,
    dialog: (
      <ConfirmDialog
        key={decision?.revision ?? 0}
        title={decision === null ? "Delete tag?" : deleteConfirmTitle(decision.tag.name)}
        description={
          decision === null
            ? "Deleting removes every attachment and cannot be undone."
            : `This removes the tag from ${usageBreakdown(decision.tag.usage)} and can't be undone.`
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
  bodyRef,
}: {
  readonly bodyRef: RefCallback<HTMLElement>;
  readonly tag: TagWithUsage;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onDelete: ConfirmedAction;
}): ReactElement {
  return (
    <LibraryRow
      bodyRef={bodyRef}
      actions={{
        name: tag.name,
        menuItemsAfter: (
          <MenuItem onClick={onDelete}>
            <Icon icon={Trash} size="sm" />
            Delete
          </MenuItem>
        ),
      }}
      // Decorative in the row's spoken form (the census is its description); the colour is stated in words in
      // the editor the row opens. `null` paints the swatch's own unset state, never a colour.
      leading={<ColorSwatch aria-hidden={true} size="sm" value={tag.color} />}
      onSelect={onSelect}
      selected={selected}
      subtitle={tagUsageLabel(tag)}
      subtitleStep="label"
      title={tag.name}
    />
  );
}
