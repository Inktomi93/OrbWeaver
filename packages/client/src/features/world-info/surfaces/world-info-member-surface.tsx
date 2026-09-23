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
import { BookOpen, Icon, Pencil, Plus } from "@orb/ui/icons";
import { Container, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import type { SortableItemKey } from "@orb/ui/sortable";
import { SortableList } from "@orb/ui/sortable";
import { Text } from "@orb/ui/text";
import { useToastManager } from "@orb/ui/toast";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import type { MemberDrillBack } from "#components";
import { MemberDrillHeader } from "#components";
import { useInvalidation, useTRPC } from "#data";
import type { CollectionMemberView } from "#lib";
import { useFocusOnMount } from "#lib";
import { clearCollectionSelection, clearWorldEntrySelection, selectWorldEntry, useSelectedWorldEntryId } from "#state";
import { BookDetailsDialog } from "../components/book-details-dialog.tsx";
import { EntryEditor } from "../components/entry-editor.tsx";
import { useApplyEntryOrder, useBackfillWorldTitles, useCreateWorldEntry, useUpdateWorldBook } from "../hooks/use-world-info-mutations.ts";

const NEW_ENTRY_TITLE = "New entry";
const NEW_ENTRY_CONTENT = "New lore.";

export function WorldInfoMemberSurface({ view }: { readonly view: CollectionMemberView }): ReactElement {
  const trpc = useTRPC();
  const { data: books } = useSuspenseQuery(trpc.worldInfo.listBooksWithUsage.queryOptions());
  const book = books.find((row) => row.id === view.memberId);
  const back = { label: `Back to ${view.library}`, onClick: (): void => clearCollectionSelection() };
  if (book === undefined) {
    // The EXIT rides the gone arm too (#1747) — the drill row is this surface's, so dropping it here would
    // strand a drilled reader on a book another device deleted.
    // @orb-waive empty-state-has-action(EmptyState): the world-info member editor's GONE arm — the open book was deleted on another device (the world-info verbs are bus-driven, so the roster refetches under the editor). The next step is picking another row in the sibling roster, which is on screen. Ends if this surface can be reached without its sibling roster.
    return (
      <Stack gap="block">
        <MemberDrillHeader back={back} />
        <EmptyState description="This book was deleted. Pick another from the list." icon={<Icon icon={BookOpen} size="lg" />} title="Book not found" />
      </Stack>
    );
  }
  return <BookEditor back={back} bookId={book.id} />;
}

function BookEditor({ bookId, back }: { readonly bookId: WorldBookId; readonly back: MemberDrillBack }): ReactElement {
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
    create.mutate({ bookId, input: { title: NEW_ENTRY_TITLE, content: NEW_ENTRY_CONTENT } }, { onSuccess: (created): void => selectWorldEntry(created.id) });
  };

  const onBackfill = (): void => {
    backfill.mutate(
      { bookId },
      {
        onSuccess: ({ filled }): void => {
          toast.add({
            title: filled === 0 ? "No blank titles to fill" : `Filled ${filled} title${filled === 1 ? "" : "s"}`,
          });
        },
      },
    );
  };

  // A selected entry drills in — the editor replaces the list until "Back to entries" clears it.
  if (selectedEntry !== null) {
    return (
      <Container>
        <Stack className="min-h-0 outline-none" data-slot="world-info-member-editor" gap="block" ref={surfaceRef} tabIndex={-1}>
          {/* THE ENTRY RUNG'S OWN DRILL ROW (#1747) — the same composite the book level above draws, so the
              two rungs of this one surface cannot speak two grammars. Its Back pops the ENTRY, never the
              book (the `makeSelectionSeam` stack's deepest rung), and it states the entry's name, which
              nothing else on this rung did: `EntryEditor` carries a Title FIELD, not a heading. */}
          <MemberDrillHeader back={{ label: "Back to entries", onClick: (): void => clearWorldEntrySelection() }} title={selectedEntry.title} />
          <EntryEditor entry={selectedEntry} onDeleted={(): void => clearWorldEntrySelection()} />
        </Stack>
      </Container>
    );
  }

  return (
    <Container>
      <Stack className="min-h-0 outline-none" data-slot="world-info-member-editor" gap="block" ref={surfaceRef} tabIndex={-1}>
        {/* THE DRILL ROW (#1747, DESIGN.md §3.4, board 06): `← Back to <library>` · the book's name · this
            book's OWN verbs — Edit details · Backfill · New entry, exactly the trio the board draws, moved
            up out of the two rows that used to carry them (the name+pencil row and the census row). No
            lifecycle chrome: Delete is the LIST row's kebab (D212, #271).
            EDIT DETAILS IS A LABELLED BUTTON NOW, not a bare pencil: the board names it, and the icon-only
            trigger's whole accessible name lived in an `aria-label` nothing on screen said. */}
        <MemberDrillHeader
          actions={
            <>
              <Button intent="secondary" onClick={(): void => setDetailsOpen(true)} size="sm">
                <Icon icon={Pencil} size="sm" />
                Edit details
              </Button>
              {/* `secondary`, NOT `ghost` (side-eye 2026-08-19 P2, the zero-resting-affordance class): at
                  ghost this is a transparent, borderless accent word sitting 8px from a filled primary, so
                  the pair read as "one button and a caption" rather than as two verbs of different weight.
                  Secondary is the house's non-primary CHROME — it has a box at rest, and the primary keeps
                  its rank because it is the only filled control in the row. */}
              <Button disabled={backfill.isPending || entries.length === 0} intent="secondary" onClick={onBackfill} size="sm">
                Backfill titles
              </Button>
              <Button disabled={create.isPending} intent="primary" onClick={onCreate} size="sm">
                <Icon icon={Plus} size="sm" />
                New entry
              </Button>
            </>
          }
          back={back}
          title={book.name}
        />
        {book.description === null || book.description === "" ? null : <Text voice="gloss">{book.description}</Text>}

        {/* The entries census, alone on its row now that the three verbs moved up to the drill row (board
            06 draws it at the list's leading edge). */}
        <Text as="span" voice="datum">
          {entries.length === 1 ? "1 entry" : `${entries.length} entries`}
        </Text>

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
            itemLabel={(entry): string => entry.title}
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
