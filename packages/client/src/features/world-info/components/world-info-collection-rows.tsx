// The world-info collection's ROWS — the OWNER half of the config-rail seam (F-5).
//
// The row anatomy is the LANDED library row, re-homed: name · the Global marker on the title line · the
// Duplicate/Export/Delete kebab. ONE thing changed, and the mock is why: the subtitle is now the
// book's SCENT ("42 entries · attached ×3") instead of its description. A list row's job is to let a
// reader pick a book without opening it, and "how much lore, switched on anywhere?" is what answers that;
// the description is the book's own prose and it still leads the member editor.
//
// EXPORT stays HERE, in the row's kebab (D121-D `kebab=Export`) — it is a per-member verb, so it is the
// owner's to render. IMPORT is the group band's, declared as data on the contribution (`importFile`).
//
// …AND RENAME LEFT THE KEBAB (#442, side-eye 2026-08-22 P2 — the #271 single-homing lens, a different verb).
// #271 converged DELETE onto this kebab because Delete had two homes; the same drive found RENAME with two,
// on world-info alone: this menu item opened `BookDetailsDialog`, and the member editor's own
// "Edit book details" opens the SAME dialog. Tags and regex rename in their editor only, so one verb read
// one way on two collections and two ways on the third — the recall burden single-homing exists to kill.
// THE DIALOG WON, not the kebab, and the direction is the opposite of #271's for a stated reason: #271's
// contested homes were the row kebab (width-free, where the row already is) versus a DELETE BUTTON inside
// the editor (a second destructive door). Here both homes open the identical dialog, and the editor's door
// is the WIDER one — it owns Description beside Name, and it sits on the surface where a book's prose is
// actually written. A rename-only second door bought a reader nothing the row click plus one pencil did not.
// The row keeps every verb the editor does NOT own: Duplicate, Export, Delete.
//
// ONE CONTAINER AT EVERY SIZE, the regex shape: the sealed `VirtualList`, so a row keeps its identity, and its focus, however
// many books arrive or leave.

import type { BookWithUsage } from "@orb/contracts/world-info";
import type { WorldBookId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Download, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { MenuItem } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import type { VirtualListHandle } from "@orb/ui/virtual-list";
import { VirtualList } from "@orb/ui/virtual-list";
import type { ReactElement } from "react";
import { useRef } from "react";
import type { RowDeleteFocus } from "#components";
import { LibraryRow, useRowDeleteFocus } from "#components";
import { useInvalidation, useSuspenseQuery, useTRPC, useTRPCClient } from "#data";
import type { CollectionListView } from "#lib";
import { downloadTextFile, ESTIMATED_ROW_PX, notify, ROW_EXPORT_NAME } from "#lib";
import { clearCollectionSelection } from "#state";
import { useDuplicateWorldBook, useRemoveWorldBook } from "../hooks/use-world-info-mutations.ts";
import { WORLD_BOOKS_LIST_NAME } from "../lib/world-books-list-name.ts";
import { bookScent } from "../lib/world-info-model.ts";

export function WorldInfoCollectionRows({ view }: { readonly view: CollectionListView }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const client = useTRPCClient();
  const { data: books } = useSuspenseQuery(trpc.worldInfo.listBooksWithUsage.queryOptions());
  const remove = useRemoveWorldBook({ trpc, invalidation });
  const duplicate = useDuplicateWorldBook({ trpc, invalidation });

  const needle = view.filter.trim().toLowerCase();
  const filtered = needle === "" ? books : books.filter((book) => book.name.toLowerCase().includes(needle));

  const onDuplicate = (id: WorldBookId): void => {
    duplicate.mutate({ bookId: id }, { onSuccess: (created): void => view.onSelect(created.id) });
  };

  const onDelete = (id: WorldBookId): void => {
    // CLEAR THE SELECTION WHEN THE BOOK IS ACTUALLY GONE (#1501). The ruling survives — its INPUT changed:
    // the reason for clearing is still "CONTENT must not hold a dead editor over a deleted id", and that
    // reason only applies once the id IS deleted. Clearing synchronously ALSO fired on a rejected delete,
    // which threw the reader out of a book that still exists and gave them no way to see it had failed
    // beyond a toast. `onSuccess`, so the two facts cannot disagree.
    remove.mutate(
      { bookId: id },
      {
        onSuccess: (): void => {
          if (view.selectedId === id) {
            clearCollectionSelection();
          }
        },
      },
    );
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

  const listRootRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<VirtualListHandle>(null);
  const rowFocus = useRowDeleteFocus(
    listRootRef,
    filtered.map((book) => book.id),
    windowRef,
  );

  const renderRow = (book: BookWithUsage): ReactElement => (
    <WorldInfoCollectionRow
      rowFocus={rowFocus}
      book={book}
      key={book.id}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      onExport={onExport}
      onSelect={(): void => view.onSelect(book.id)}
      selected={view.selectedId === book.id}
    />
  );

  // The three list arms as ONE expression (early returns, not nested ternaries).
  const rows = ((): ReactElement | null => {
    if (filtered.length === 0) {
      // A FILTER MISS AND AN EMPTY LIBRARY ARE DIFFERENT STATES (side-eye 2026-08-03 P1): with no needle
      // this printed filter copy above the host's own zero-member slot — two empty states, one of them a
      // lie. No needle ⇒ the host's slot is the only voice.
      // …AND THE MISS SPEAKS (side-eye 2026-08-19 P3): focus stays in the host's filter box, so the one
      // state with no rows at all had no feedback a keyboard reader received. `role="status"` rides the
      // MESSAGE, never the row container — a live region around the list would announce every row on every
      // keystroke. Same fix, same words, in the tag and regex arms.
      return needle === "" ? null : (
        <Text role="status" voice="gloss">
          No books match that filter.
        </Text>
      );
    }
    return (
      <VirtualList
        aria-label={WORLD_BOOKS_LIST_NAME}
        // THE PANE IS THE WINDOW (the mock design §5.4): the list takes the landing's free space inside the CONTENT pane's scroller.
        grow={true}
        estimateSize={(): number => ESTIMATED_ROW_PX.compact}
        // The window ends mid-row, and under overlay scrollbars that sliver is the only "there is more" cue there is.
        fadeEdge={true}
        gapToken="field"
        getItemKey={(book): string => book.id}
        items={filtered}
        ref={windowRef}
        renderItem={renderRow}
      />
    );
  })();

  return (
    // THE LIST ROOT: the fallback focus when no row can take it, and the landing's free space handed to the window.
    <Stack focusTarget={true} grow={true} ref={listRootRef} tabIndex={-1}>
      {rows}
    </Stack>
  );
}

interface WorldInfoCollectionRowProps {
  readonly book: BookWithUsage;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onDelete: (id: WorldBookId) => void;
  readonly onDuplicate: (id: WorldBookId) => void;
  readonly onExport: (id: WorldBookId) => void;
  /** Takes focus back by key: after a remount, or on the Back from the book this row opened. */
  readonly rowFocus: RowDeleteFocus;
}

function WorldInfoCollectionRow({ book, selected, onSelect, onDelete, onDuplicate, onExport, rowFocus }: WorldInfoCollectionRowProps): ReactElement {
  return (
    <LibraryRow
      bodyRef={rowFocus.bodyRef(book.id)}
      actions={{
        name: book.name,
        // No `onRename` — the Book details dialog is naming's one home (#442, see the header). `LibraryRow`
        // omits the item when the handler is absent, the regex list's own posture.
        onDuplicate: (): void => onDuplicate(book.id),
        onDelete: (): void => onDelete(book.id),
        deleteDescription: "This permanently removes the book and every entry in it, and detaches it everywhere. This can't be undone.",
        // Below Duplicate, above the destructive Delete — the §9 kebab order.
        menuItemsAfter: (
          <MenuItem onClick={(): void => onExport(book.id)}>
            <Icon icon={Download} size="sm" />
            {ROW_EXPORT_NAME}
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
    <Badge tone="info" variant="solid" size="sm">
      Global
    </Badge>
  );
}
