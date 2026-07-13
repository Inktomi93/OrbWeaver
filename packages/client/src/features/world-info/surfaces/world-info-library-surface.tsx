// The world-info LIBRARY surface — the World Info LIST hub (UI-Arch §4.1: header row · search · rows; §4.2
// rule 1: LIST selection drives CONTENT). A containment CONSUMER (§2.1) — the anchor owns the box. Reads
// `worldInfo.listBooks` (a small owned collection — no pagination) + `worldInfo.listGlobal` (to mark the
// "Global" badge on rows), filters client-side by name (`useDeferredValue` — §13.2 search-over-collection),
// and renders a `WorldInfoLibraryRow` per book. Selection flows LEFT→RIGHT: a row click OPENS the book in
// CONTENT (`selectWorldBook` — the §5.1 writer-only seam) and NEVER attaches it (activation is the CONTEXT
// panel). CRUD is client composition over the verbs — New (`createBook`) · Duplicate (`duplicateBook`, a
// server-side deep copy) · Rename (row kebab → `BookDetailsDialog` → `updateBook`) · Delete (row kebab →
// AlertDialog → `removeBook`). Overlays live in the ROW / dialog components (surface-purity — a surface
// renders no outer overlay); the surface wires the mutations.

import type { WorldBookId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve BookOpen/Icon/Plus/Search fine (the preset-library-surface.tsx precedent).
import { BookOpen, Icon, Plus, Search } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useDeferredValue, useRef, useState } from "react";
import { QueryBoundary, useInvalidation, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import { clearWorldBookSelection, selectWorldBook, useSelectedWorldBookId } from "#state";
import { BookDetailsDialog } from "../components/book-details-dialog";
import { WorldInfoLibraryRow } from "../components/world-info-library-row";
import {
  useCreateWorldBook,
  useDuplicateWorldBook,
  useRemoveWorldBook,
  useUpdateWorldBook,
} from "../hooks/use-world-info-mutations";

const NEW_BOOK_NAME = "New book";

export interface WorldInfoLibrarySurfaceProps {
  /** Open a book in CONTENT (the §5.1 writer-only seam). The route injects a wrapper that ALSO closes the
   *  mobile LIST sheet; defaults to the bare `selectWorldBook` writer. Used at every "open a book" moment. */
  readonly onSelectBook?: ((id: WorldBookId) => void) | undefined;
}

/** The World Info LIST body (rendered inside the shell's `worldInfo` LIST slot). */
export function WorldInfoLibrarySurface({
  onSelectBook,
}: WorldInfoLibrarySurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="h-full outline-none" gap="block">
      <QueryBoundary
        fallback={<Text tone="muted">Loading your books…</Text>}
        renderError={(_error, retry): ReactElement => (
          <Text tone="muted">
            Couldn't load your books.{" "}
            <Button intent="ghost" onClick={retry}>
              Retry
            </Button>
          </Text>
        )}
      >
        <BookList onSelectBook={onSelectBook ?? selectWorldBook} />
      </QueryBoundary>
    </Stack>
  );
}

function BookList({
  onSelectBook,
}: {
  readonly onSelectBook: (id: WorldBookId) => void;
}): ReactElement {
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
  const filtered =
    needle === "" ? books : books.filter((b) => b.name.toLowerCase().includes(needle));

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
    <Stack gap="block" className="h-full">
      <Row gap="field" align="center" justify="between">
        <Text size="micro" tone="muted" transform="caps">
          World Info
        </Text>
        <Button intent="primary" size="sm" onClick={onCreate} disabled={create.isPending}>
          <Icon icon={Plus} size="sm" />
          New
        </Button>
      </Row>

      <Input
        value={query}
        onValueChange={setQuery}
        placeholder="Search books"
        aria-label="Search books"
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Icon icon={needle === "" ? BookOpen : Search} size="lg" />}
          title={needle === "" ? "No books yet" : "No matches"}
          description={
            needle === ""
              ? "Create a world book to hold keyword-triggered lore your characters can draw on."
              : "No book matches your search."
          }
          action={
            needle === "" ? (
              <Button intent="secondary" size="sm" onClick={onCreate} disabled={create.isPending}>
                New book
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Stack gap="field" className="min-h-0 flex-1 overflow-y-auto">
          {filtered.map((book) => (
            <WorldInfoLibraryRow
              key={book.id}
              book={book}
              selected={book.id === selectedId}
              global={globalIds.has(book.id)}
              onSelect={onSelectBook}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onRename={(id): void => setRenameId(id)}
            />
          ))}
        </Stack>
      )}

      {renameBook !== null ? (
        <BookDetailsDialog
          open={true}
          onOpenChange={(next): void => {
            if (!next) {
              setRenameId(null);
            }
          }}
          currentName={renameBook.name}
          currentDescription={renameBook.description}
          onSave={(patch): void => update.mutate({ bookId: renameBook.id, input: patch })}
        />
      ) : null}
    </Stack>
  );
}
