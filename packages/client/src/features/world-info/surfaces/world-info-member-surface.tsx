// The world-info MEMBER EDITOR — CONTENT for one selected book (config-rail-spec.md §2 C-7). The SAME
// two-level editor the rail section's CONTENT mounted, unchanged: the book view (header + entry list + New
// entry) and, when an entry is selected, the full-fidelity entry editor drilled in the same region. Only its
// HOST moved — it is a collection's `detail` now, not a section's `content`.
//
// THE MEMBER ID IS RE-BRANDED HERE (the seam hands the host-opaque string): the book is looked up in the
// SAME `listBooksWithUsage` cache the rows render from, which both mints the branded `WorldBookId` and gives
// the GONE arm for free — another device deleting the open book leaves a sentence, not a 404 boundary.

import type { EntryView } from "@orb/contracts/world-info";
import type { WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { ArrowLeft, BookOpen, Icon, Pencil, Plus } from "@orb/ui/icons";
import { Container, Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import type { SortableItemKey } from "@orb/ui/sortable";
import { SortableList } from "@orb/ui/sortable";
import { Heading, Text } from "@orb/ui/text";
import { useToastManager } from "@orb/ui/toast";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import { clearWorldEntrySelection, selectWorldEntry, useSelectedWorldEntryId } from "#state";
import { BookDetailsDialog } from "../components/book-details-dialog";
import { EntryEditor } from "../components/entry-editor";
import { useApplyEntryOrder, useBackfillWorldTitles, useCreateWorldEntry, useUpdateWorldBook } from "../hooks/use-world-info-mutations";

const NEW_ENTRY_TITLE = "New entry";
const NEW_ENTRY_CONTENT = "New lore.";

export function WorldInfoMemberSurface({ memberId }: { readonly memberId: string }): ReactElement {
  const trpc = useTRPC();
  const { data: books } = useSuspenseQuery(trpc.worldInfo.listBooksWithUsage.queryOptions());
  const book = books.find((row) => row.id === memberId);
  if (book === undefined) {
    return <EmptyState description="This book was deleted. Pick another on the left." icon={<Icon icon={BookOpen} size="lg" />} title="Book not found" />;
  }
  return <BookEditor bookId={book.id} />;
}

function BookEditor({ bookId }: { readonly bookId: WorldBookId }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const toast = useToastManager();
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  const { data: book } = useSuspenseQuery(trpc.worldInfo.getBook.queryOptions({ bookId }));
  const { data: entries } = useSuspenseQuery(trpc.worldInfo.listEntries.queryOptions({ bookId }));
  const selectedEntryId = useSelectedWorldEntryId();
  const create = useCreateWorldEntry({ trpc, invalidation });
  const update = useUpdateWorldBook({ trpc, invalidation });
  const backfill = useBackfillWorldTitles({ trpc, invalidation });
  const reorder = useApplyEntryOrder({ trpc, invalidation });
  const [detailsOpen, setDetailsOpen] = useState(false);

  // A remembered entry from a DIFFERENT book simply doesn't match here, so the surface falls back to the
  // entry list — which is why the entry selection needs no clearing when the open book changes.
  const selectedEntry = entries.find((e) => e.id === selectedEntryId) ?? null;

  // Drag settled: the sortable reports the new key order; persist it (position i → priority N-i). The hook
  // optimistically re-sorts the cached list so the rows land instantly, then reconciles from the server.
  const onReorder = (orderedKeys: SortableItemKey[]): void => {
    reorder.mutate({ bookId, orderedEntryIds: orderedKeys.map((k) => k as WorldEntryId) });
  };

  const onCreate = (): void => {
    void create.mutateAsync({ bookId, input: { title: NEW_ENTRY_TITLE, content: NEW_ENTRY_CONTENT } }).then((created) => selectWorldEntry(created.id));
  };

  const onBackfill = (): void => {
    void backfill.mutateAsync({ bookId }).then(({ filled }) =>
      toast.add({
        title: filled === 0 ? "No blank titles to fill" : `Filled ${filled} title${filled === 1 ? "" : "s"}`,
      }),
    );
  };

  // A selected entry drills in — the editor replaces the list until "Back to entries" clears it.
  if (selectedEntry !== null) {
    return (
      <Container>
        <Stack className="min-h-0 outline-none" data-slot="world-info-member-editor" gap="block" ref={surfaceRef} tabIndex={-1}>
          <Row align="center" gap="field">
            <Button aria-label="Back to entries" intent="ghost" onClick={(): void => clearWorldEntrySelection()} size="sm">
              <Icon icon={ArrowLeft} size="sm" />
              Entries
            </Button>
          </Row>
          <EntryEditor entry={selectedEntry} onDeleted={(): void => clearWorldEntrySelection()} />
        </Stack>
      </Container>
    );
  }

  return (
    <Container>
      <Stack className="min-h-0 outline-none" data-slot="world-info-member-editor" gap="block" ref={surfaceRef} tabIndex={-1}>
        <Row align="start" gap="field" justify="between">
          <Stack className="min-w-0" gap="tight">
            <Heading level={2}>{book.name}</Heading>
            {book.description === null || book.description === "" ? null : <Text voice="gloss">{book.description}</Text>}
          </Stack>
          <Button aria-label="Edit book details" intent="ghost" onClick={(): void => setDetailsOpen(true)} size="sm">
            <Icon icon={Pencil} size="sm" />
          </Button>
        </Row>

        <Row align="center" gap="field" justify="between">
          <Text as="span" voice="datum">
            {entries.length === 1 ? "1 entry" : `${entries.length} entries`}
          </Text>
          <Row align="center" gap="field">
            <Button disabled={backfill.isPending || entries.length === 0} intent="ghost" onClick={onBackfill} size="sm">
              Backfill titles
            </Button>
            <Button disabled={create.isPending} intent="primary" onClick={onCreate} size="sm">
              <Icon icon={Plus} size="sm" />
              New entry
            </Button>
          </Row>
        </Row>

        {entries.length === 0 ? (
          <EmptyState
            action={
              <Button disabled={create.isPending} intent="secondary" onClick={onCreate} size="sm">
                New entry
              </Button>
            }
            description="Add an entry — a piece of lore that fires into the prompt when its keywords come up."
            icon={<Icon icon={BookOpen} size="lg" />}
            title="No entries yet"
          />
        ) : (
          // handle mode: only the grip drags, so each row's own click (drill into the editor) stays live.
          <SortableList
            getItemKey={(entry): SortableItemKey => entry.id}
            handle={true}
            handleLabel={(entry): string => `Reorder ${entry.title}`}
            items={entries}
            onReorder={onReorder}
            renderItem={(entry): ReactElement => <EntryRow entry={entry} onSelect={(id): void => selectWorldEntry(id)} />}
          />
        )}

        <BookDetailsDialog
          currentDescription={book.description}
          currentName={book.name}
          onOpenChange={setDetailsOpen}
          onSave={(patch): void => update.mutate({ bookId, input: patch })}
          open={detailsOpen}
        />
      </Stack>
    </Container>
  );
}

/** One entry row in the book overview — title · a keyword/always summary · an enabled/disabled badge. */
function EntryRow({ entry, onSelect }: { readonly entry: EntryView; readonly onSelect: (id: WorldEntryId) => void }): ReactElement {
  const keys = entry.keys ?? [];
  const summary = keys.length === 0 ? "Always" : keys.join(", ");
  return (
    <ListRow
      actions={
        entry.enabled ? (
          <Badge intent="success" size="sm">
            On
          </Badge>
        ) : (
          <Badge intent="neutral" size="sm">
            Off
          </Badge>
        )
      }
      clickable={true}
      onClick={(): void => onSelect(entry.id)}
      subtitle={summary}
      title={entry.title}
    />
  );
}
