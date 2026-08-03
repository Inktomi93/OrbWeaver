// The world-info collection's ROWS — the OWNER half of the config-rail seam (F-5).
//
// The row anatomy is the LANDED library row, re-homed: name · the Global marker on the title line · the
// Rename/Duplicate/Export/Delete kebab. ONE thing changed, and the mock is why: the subtitle is now the
// book's SCENT ("42 entries · attached ×3") instead of its description. A roster row's job is to let a
// reader pick a book without opening it, and "how much lore, switched on anywhere?" is what answers that;
// the description is the book's own prose and it still leads the member editor.
//
// EXPORT stays HERE, in the row's kebab (D121-D `kebab=Export`) — it is a per-member verb, so it is the
// owner's to render. IMPORT is the group band's, declared as data on the contribution (`importFile`).
//
// Two render arms by size, the tag/regex shape: the sealed `VirtualList` in a bounded box past
// COLLECTION_LARGE_GROUP (with the host's filter), a plain stack below it.

import type { BookWithUsage } from "@orb/contracts/world-info";
import type { WorldBookId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Download, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { MenuItem } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import { VirtualList } from "@orb/ui/virtual-list";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { LibraryRow } from "#components";
import { useInvalidation, useTRPC, useTRPCClient } from "#data";
import type { CollectionListView } from "#lib";
import { COLLECTION_LARGE_GROUP, downloadTextFile, notify } from "#lib";
import { clearCollectionSelection } from "#state";
import { useDuplicateWorldBook, useRemoveWorldBook, useUpdateWorldBook } from "../hooks/use-world-info-mutations";
import { bookScent } from "../lib/world-info-model";
import { BookDetailsDialog } from "./book-details-dialog";

/** One compact row's height guess for the windowed arm (name + scent subtitle). */
const ESTIMATED_ROW_PX = 44;

export function WorldInfoCollectionRows({ view }: { readonly view: CollectionListView }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const client = useTRPCClient();
  const { data: books } = useSuspenseQuery(trpc.worldInfo.listBooksWithUsage.queryOptions());
  const update = useUpdateWorldBook({ trpc, invalidation });
  const remove = useRemoveWorldBook({ trpc, invalidation });
  const duplicate = useDuplicateWorldBook({ trpc, invalidation });
  const [renameId, setRenameId] = useState<WorldBookId | null>(null);

  const needle = view.filter.trim().toLowerCase();
  const filtered = needle === "" ? books : books.filter((book) => book.name.toLowerCase().includes(needle));
  const renameBook = books.find((book) => book.id === renameId) ?? null;

  const onDuplicate = (id: WorldBookId): void => {
    void duplicate.mutateAsync({ bookId: id }).then((created) => view.onSelect(created.id));
  };

  const onDelete = (id: WorldBookId): void => {
    // Clear the selection FIRST when the open book is the one being deleted, so CONTENT falls back to the
    // workspace welcome instead of holding a dead editor over a deleted id.
    if (view.selectedId === id) {
      clearCollectionSelection();
    }
    remove.mutate({ bookId: id });
  };

  // The bytes are the SERVER's (the same file the backup bundle carries for this book), downloaded verbatim
  // so a shared book and a restored one can never diverge.
  const onExport = (id: WorldBookId): void => {
    void client.worldInfo.exportBook
      .query({ bookId: id })
      .then((file) => {
        downloadTextFile(file.filename, file.fileText);
      })
      .catch((error: unknown) => {
        notify.error(error instanceof Error ? error.message : "Couldn't export the book.");
      });
  };

  const renderRow = (book: BookWithUsage): ReactElement => (
    <WorldInfoCollectionRow
      book={book}
      key={book.id}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      onExport={onExport}
      onRename={(id): void => setRenameId(id)}
      onSelect={(): void => view.onSelect(book.id)}
      selected={view.selectedId === book.id}
    />
  );

  // The three list arms as ONE expression (early returns, not nested ternaries) — the rename dialog is a
  // sibling of whichever arm renders, and it must survive an arm swap.
  const rows = ((): ReactElement => {
    if (filtered.length === 0) {
      return <Text voice="gloss">No books match that filter.</Text>;
    }
    if (books.length > COLLECTION_LARGE_GROUP) {
      return (
        <VirtualList
          aria-label="World books"
          className="max-h-96"
          estimateSize={(): number => ESTIMATED_ROW_PX}
          gapToken="field"
          getItemKey={(book): string => book.id}
          items={filtered}
          renderItem={renderRow}
        />
      );
    }
    return <Stack gap="tight">{filtered.map(renderRow)}</Stack>;
  })();

  return (
    <>
      {rows}

      {renameBook === null ? null : (
        <BookDetailsDialog
          currentDescription={renameBook.description}
          currentName={renameBook.name}
          onOpenChange={(next): void => {
            if (!next) {
              setRenameId(null);
            }
          }}
          onSave={(patch): void => update.mutate({ bookId: renameBook.id, input: patch })}
          open={true}
        />
      )}
    </>
  );
}

interface WorldInfoCollectionRowProps {
  readonly book: BookWithUsage;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onDelete: (id: WorldBookId) => void;
  readonly onDuplicate: (id: WorldBookId) => void;
  readonly onRename: (id: WorldBookId) => void;
  readonly onExport: (id: WorldBookId) => void;
}

function WorldInfoCollectionRow({ book, selected, onSelect, onDelete, onDuplicate, onExport, onRename }: WorldInfoCollectionRowProps): ReactElement {
  return (
    <LibraryRow
      actions={{
        name: book.name,
        onRename: (): void => onRename(book.id),
        onDuplicate: (): void => onDuplicate(book.id),
        onDelete: (): void => onDelete(book.id),
        deleteDescription: "This permanently removes the book and every entry in it, and detaches it everywhere. This can't be undone.",
        // Below Duplicate, above the destructive Delete — the §9 kebab order.
        menuItemsAfter: (
          <MenuItem onClick={(): void => onExport(book.id)}>
            <Icon icon={Download} size="sm" />
            Export
          </MenuItem>
        ),
      }}
      onSelect={onSelect}
      selected={selected}
      subtitle={bookScent(book)}
      title={book.name}
      {...(book.usage.global ? { markers: <GlobalMarker /> } : {})}
    />
  );
}

/** The passive GLOBAL marker on the title line — a status ("this one fires in every chat"), never a
 *  make-global affordance: activation lives in the book's CONTEXT arm. Kept beside the scent because
 *  "attached ×3" cannot say WHICH scope, and everywhere is the one scope with no other home. */
function GlobalMarker(): ReactElement {
  return (
    <Badge intent="info" size="sm">
      Global
    </Badge>
  );
}
