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
import { LibraryRow } from "#components";
import { useInvalidation, useTRPC, useTRPCClient } from "#data";
import type { CollectionListView } from "#lib";
import { COLLECTION_LARGE_GROUP, downloadTextFile, notify } from "#lib";
import { clearCollectionSelection } from "#state";
import { useDuplicateWorldBook, useRemoveWorldBook } from "../hooks/use-world-info-mutations.ts";
import { bookScent } from "../lib/world-info-model.ts";

/** One compact row's height guess for the windowed arm (name + scent subtitle). */
const ESTIMATED_ROW_PX = 44;

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

  const renderRow = (book: BookWithUsage): ReactElement => (
    <WorldInfoCollectionRow
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
    if (books.length > COLLECTION_LARGE_GROUP) {
      return (
        <VirtualList
          aria-label="World books"
          // THE PANE IS THE WINDOW (#1725, the mock design §5.4). This was the shared `max-h-96` cap — a flat 384px
          // that existed to stop one library pushing its sibling BANDS below the fold in the LIST's shared
          // scroll column. That column is gone, so the bound is the CONTENT pane's own `overflow-y-auto overscroll-contain` box,
          // reached by flex (`character-library-body.tsx`'s chain): the landing is `min-h-0 flex-1` in the
          // pane and this is `min-h-0 flex-1` in the landing. `min-h-0` is the load-bearing half — a flex
          // child defaults to `min-height: auto`, which lets the scroller grow to its content and trips the
          // primitive's own unbounded-window throw.
          className="min-h-0 flex-1"
          estimateSize={(): number => ESTIMATED_ROW_PX}
          // Same reason as the tag/regex arms (side-eye 2026-08-06 P2): a fixed cap over uniform rows ends
          // mid-row, and under overlay scrollbars that sliver is the only "there is more" cue there is.
          fadeEdge={true}
          gapToken="field"
          getItemKey={(book): string => book.id}
          items={filtered}
          renderItem={renderRow}
        />
      );
    }
    // LIST SEMANTICS ARE EXPLICIT HERE (side-eye 2026-08-19 P2), the tag/regex small-arm spelling: the
    // windowed sibling above announces "list, N items" of its own, so a bare `Stack` of buttons made ONE
    // library speak two a11y grammars depending only on how many books the reader owns. Invisible on the
    // owner's corpus (59 books window into the `VirtualList` arm) — which is exactly why the pin for it is
    // a small-list CT fixture and not a live drive.
    return (
      <Stack aria-label="World books" gap="tight" role="list">
        {filtered.map((book, index) => (
          <Stack aria-posinset={index + 1} aria-setsize={filtered.length} key={book.id} role="listitem">
            {renderRow(book)}
          </Stack>
        ))}
      </Stack>
    );
  })();

  return <>{rows}</>;
}

interface WorldInfoCollectionRowProps {
  readonly book: BookWithUsage;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onDelete: (id: WorldBookId) => void;
  readonly onDuplicate: (id: WorldBookId) => void;
  readonly onExport: (id: WorldBookId) => void;
}

function WorldInfoCollectionRow({ book, selected, onSelect, onDelete, onDuplicate, onExport }: WorldInfoCollectionRowProps): ReactElement {
  return (
    <LibraryRow
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
