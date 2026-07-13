// The World Info CONTENT for the open book. Two levels, drilled in one region: the book view (header +
// entry list + New entry) and, when an entry is selected, the full-fidelity entry editor. Reads
// worldInfo.getBook + listEntries (EntryView[] carries every field, so the editor seeds with no extra
// getEntry). Selection flows through the world-info-selection store.

import type { EntryView } from "@orb/contracts/world-info";
import type { WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve list glyphs fine (the preset-editor-surface.tsx precedent).
import { ArrowLeft, BookOpen, Icon, Pencil, Plus } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { QueryBoundary, useInvalidation, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import { clearWorldEntrySelection, selectWorldEntry, useSelectedWorldEntryId } from "#state";
import { BookDetailsDialog } from "../components/book-details-dialog";
import { EntryEditor } from "../components/entry-editor";
import { useCreateWorldEntry, useUpdateWorldBook } from "../hooks/use-world-info-mutations";

const NEW_ENTRY_TITLE = "New entry";
const NEW_ENTRY_CONTENT = "New lore.";

export interface WorldInfoEditorSurfaceProps {
  readonly bookId: WorldBookId;
}

/** The book editor (its entries + the drilled entry form) for the selected book. */
export function WorldInfoEditorSurface({ bookId }: WorldInfoEditorSurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack
      ref={surfaceRef}
      tabIndex={-1}
      className="h-full min-h-0 overflow-y-auto overflow-x-hidden outline-none"
    >
      <QueryBoundary
        fallback={<Text tone="muted">Loading the book…</Text>}
        renderError={(_error, retry): ReactElement => (
          <Text tone="muted">
            Couldn't load the book.{" "}
            <Button intent="ghost" onClick={retry}>
              Retry
            </Button>
          </Text>
        )}
      >
        <BookEditor bookId={bookId} />
      </QueryBoundary>
    </Stack>
  );
}

function BookEditor({ bookId }: { readonly bookId: WorldBookId }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: book } = useSuspenseQuery(trpc.worldInfo.getBook.queryOptions({ bookId }));
  const { data: entries } = useSuspenseQuery(trpc.worldInfo.listEntries.queryOptions({ bookId }));
  const selectedEntryId = useSelectedWorldEntryId();
  const create = useCreateWorldEntry({ trpc, invalidation });
  const update = useUpdateWorldBook({ trpc, invalidation });
  const [detailsOpen, setDetailsOpen] = useState(false);

  const selectedEntry = entries.find((e) => e.id === selectedEntryId) ?? null;

  const onCreate = (): void => {
    void create
      .mutateAsync({ bookId, input: { title: NEW_ENTRY_TITLE, content: NEW_ENTRY_CONTENT } })
      .then((created) => selectWorldEntry(created.id));
  };

  // A selected entry drills in — the editor replaces the list until "Back to entries" clears it.
  if (selectedEntry !== null) {
    return (
      <Stack gap="block" className="min-h-0">
        <Row gap="field" align="center" padding="block" className="pb-0">
          <Button
            intent="ghost"
            size="sm"
            onClick={(): void => clearWorldEntrySelection()}
            aria-label="Back to entries"
          >
            <Icon icon={ArrowLeft} size="sm" />
            Entries
          </Button>
        </Row>
        <EntryEditor entry={selectedEntry} onDeleted={(): void => clearWorldEntrySelection()} />
      </Stack>
    );
  }

  return (
    <Stack gap="block" padding="block">
      <Row gap="field" align="start" justify="between">
        <Stack gap="field" className="min-w-0">
          <Text size="label" weight="medium">
            {book.name}
          </Text>
          {book.description ? (
            <Text size="body" tone="muted">
              {book.description}
            </Text>
          ) : null}
        </Stack>
        <Button
          intent="ghost"
          size="sm"
          onClick={(): void => setDetailsOpen(true)}
          aria-label="Edit book details"
        >
          <Icon icon={Pencil} size="sm" />
        </Button>
      </Row>

      <Row gap="field" align="center" justify="between">
        <Text size="micro" tone="muted" transform="caps">
          {entries.length === 1 ? "1 entry" : `${entries.length} entries`}
        </Text>
        <Button intent="primary" size="sm" onClick={onCreate} disabled={create.isPending}>
          <Icon icon={Plus} size="sm" />
          New entry
        </Button>
      </Row>

      {entries.length === 0 ? (
        <EmptyState
          icon={<Icon icon={BookOpen} size="lg" />}
          title="No entries yet"
          description="Add an entry — a piece of lore that fires into the prompt when its keywords come up."
          action={
            <Button intent="secondary" size="sm" onClick={onCreate} disabled={create.isPending}>
              New entry
            </Button>
          }
        />
      ) : (
        <Stack gap="field">
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} onSelect={(id): void => selectWorldEntry(id)} />
          ))}
        </Stack>
      )}

      <BookDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        currentName={book.name}
        currentDescription={book.description}
        onSave={(patch): void => update.mutate({ bookId, input: patch })}
      />
    </Stack>
  );
}

/** One entry row in the book overview — title · a keyword/always summary · an enabled/disabled badge. */
function EntryRow({
  entry,
  onSelect,
}: {
  readonly entry: EntryView;
  readonly onSelect: (id: WorldEntryId) => void;
}): ReactElement {
  const keys = entry.keys ?? [];
  const summary = keys.length === 0 ? "Always" : keys.join(", ");
  return (
    <ListRow
      clickable={true}
      onClick={(): void => onSelect(entry.id)}
      title={entry.title}
      subtitle={summary}
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
    />
  );
}
