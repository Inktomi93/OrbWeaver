// The World Info LIST hub: header band, search, rows. Reads worldInfo.listBooks + listGlobal (to mark
// the "Global" badge), filters client-side by name, renders a WorldInfoLibraryRow per book. A row click
// opens the book in CONTENT and never attaches it. Overlays live in the row/dialog components; the
// surface only wires the mutations. The focus/QueryBoundary shell + header/search/empty body come from
// the shared library-surface scaffold.

import type { WorldBookId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { BookOpen, Icon, Plus, Search } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useDeferredValue, useRef, useState } from "react";
import { LibraryListLayout, LibrarySurfaceShell } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import { clearWorldBookSelection, selectWorldBook, useSelectedWorldBookId } from "#state";
import { BookDetailsDialog } from "../components/book-details-dialog";
import { WorldInfoLibraryRow } from "../components/world-info-library-row";
import { useCreateWorldBook, useDuplicateWorldBook, useRemoveWorldBook, useUpdateWorldBook } from "../hooks/use-world-info-mutations";

const NEW_BOOK_NAME = "New book";

export interface WorldInfoLibrarySurfaceProps {
  /** Open a book in CONTENT (the §5.1 writer-only seam). The route injects a wrapper that ALSO closes the
   *  mobile LIST sheet; defaults to the bare `selectWorldBook` writer. Used at every "open a book" moment. */
  readonly onSelectBook?: ((id: WorldBookId) => void) | undefined;
}

/** The World Info LIST body (rendered inside the shell's `worldInfo` LIST slot). */
export function WorldInfoLibrarySurface({ onSelectBook }: WorldInfoLibrarySurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack ref={surfaceRef} className="h-full outline-none" gap="block" tabIndex={-1}>
      <LibrarySurfaceShell errorLabel="your books" loadingLabel="Loading your books…">
        <BookList onSelectBook={onSelectBook ?? selectWorldBook} />
      </LibrarySurfaceShell>
    </Stack>
  );
}

function BookList({ onSelectBook }: { readonly onSelectBook: (id: WorldBookId) => void }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: books } = useSuspenseQuery(trpc.worldInfo.listBooks.queryOptions());
  const { data: globalBooks } = useSuspenseQuery(trpc.worldInfo.listGlobal.queryOptions());
  const selectedId = useSelectedWorldBookId();

  const create = useCreateWorldBook({ trpc, invalidation });
  const update = useUpdateWorldBook({ trpc, invalidation });
  const remove = useRemoveWorldBook({ trpc, invalidation });
  const duplicate = useDuplicateWorldBook({ trpc, invalidation });

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [renameId, setRenameId] = useState<WorldBookId | null>(null);

  const globalIds = new Set(globalBooks.map((b) => b.id));
  const needle = deferredQuery.trim().toLowerCase();
  const filtered = needle === "" ? books : books.filter((b) => b.name.toLowerCase().includes(needle));

  const onCreate = (): void => {
    void create.mutateAsync({ input: { name: NEW_BOOK_NAME } }).then((created) => {
      onSelectBook(created.id);
    });
  };

  const onDuplicate = (id: WorldBookId): void => {
    void duplicate.mutateAsync({ bookId: id }).then((created) => {
      onSelectBook(created.id);
    });
  };

  const onDelete = (id: WorldBookId): void => {
    // Clear the selection FIRST when the open book is the one being deleted, so CONTENT falls back to the
    // welcome instead of a getBook 404 error boundary (the deleted id would otherwise stay selected).
    if (id === selectedId) {
      clearWorldBookSelection();
    }
    remove.mutate({ bookId: id });
  };

  const renameBook = books.find((b) => b.id === renameId) ?? null;

  return (
    <>
      <LibraryListLayout
        actions={
          <Button disabled={create.isPending} intent="primary" onClick={onCreate} size="sm">
            <Icon icon={Plus} size="sm" />
            New
          </Button>
        }
        empty={
          <EmptyState
            action={
              needle === "" ? (
                <Button disabled={create.isPending} intent="secondary" onClick={onCreate} size="sm">
                  New book
                </Button>
              ) : undefined
            }
            description={needle === "" ? "Create a world book to hold keyword-triggered lore your characters can draw on." : "No book matches your search."}
            icon={<Icon icon={needle === "" ? BookOpen : Search} size="lg" />}
            title={needle === "" ? "No books yet" : "No matches"}
          />
        }
        isEmpty={filtered.length === 0}
        onSearchChange={setQuery}
        searchLabel="Search books"
        searchPlaceholder="Search books"
        searchValue={query}
        title="World Info"
      >
        {filtered.map((book) => (
          <WorldInfoLibraryRow
            book={book}
            global={globalIds.has(book.id)}
            key={book.id}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onRename={(id): void => setRenameId(id)}
            onSelect={onSelectBook}
            selected={book.id === selectedId}
          />
        ))}
      </LibraryListLayout>

      {renameBook !== null ? (
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
      ) : null}
    </>
  );
}
