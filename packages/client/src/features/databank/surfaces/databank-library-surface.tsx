// The databank library surface — the Databank LIST hub. Reads `databank.list` + `databank.listGlobal`
// (D-1's id set, which is what lets the row's `Everywhere` toggle exist WITHOUT legacy's per-row
// `listAttachments` N+1), filters client-side by name, and renders a `DatabankLibraryRow` per document.
// A row click opens the document in CONTENT. The focus/QueryBoundary shell + the search/empty body come from
// the shared library-surface scaffold, so this pane's density is the same instrument tier presets and the
// config collections resolve to, by construction.
//
// FRESHNESS — D-3, THE SHIP-NOW ARM (b). There is no databank bus event and `UploadResult` does not carry
// the ingest `workloadId` today, so a freshly added document would sit at `Queued` until the user navigated
// away and back — legacy's single most visible "is it broken?" hole (§2.2). The bounded poll here closes it
// for EVERY producer and, unlike the push arm, also survives a reload (a workloadId held in component state
// does not): the list refetches on an interval ONLY while some row is in an in-flight ingest phase, and the
// interval evaluates to `false` the moment none is. A bank at rest makes zero extra requests.
// D-3 arm (a) — `workloadId` on `UploadResult` + the `BundleWorkloadTracker` subscription — remains the
// spec's recommendation for S5 and is strictly additive on top of this.
//
// SEARCH is the client-side name filter over the LOADED pages, matching world-info/presets and — now that
// this pane pages — `character.list`'s ruled answer to the same question: a search that finds nothing among
// the loaded rows says so AND offers the next page ("load more to keep looking"), rather than pretending the
// bank ends where the fetch did. Server-side name search was NOT built: it would be a second retrieval
// axis beside `search.documents` for a filter the loaded window answers, and the house already ruled this
// shape on the library that pages hardest. `databank.list` accepts an `origin` facet; NOT built, by ruling
// (D-5) — no evidence of need at observed bank sizes.
//
// PAGINATION (the 100-doc ceiling): the pane rides `createCollectionSurface` over `databank.list`'s keyset
// cursor, `UserSettings.library.pageSize` rows per page, with a "Load more" tail — the `character.list`
// pair, because a non-virtualized scroll list has no `onEndApproach` of its own. Before this the pane
// rendered exactly the verb's 100-row default page and had no way to ask for more, so the 101st document
// was unreachable from the UI entirely.

import type { DocumentView } from "@orb/contracts/databank";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { DocumentId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { FileText, Icon, Search, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useDeferredValue, useRef, useState } from "react";
import { LibraryListLayout, LibrarySurfaceShell } from "#components";
import type { Trpc } from "#data";
import { createCollectionSurface, QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { timeLib, useFocusOnMount } from "#lib";
import type { IngestPhase } from "#state";
import { clearDatabankPhaseFilter, clearDocumentSelection, openModal, selectDocumentFromList, useDatabankPhaseFilter, useSelectedDocumentId } from "#state";
import { DatabankLibraryRow } from "../components/databank-library-row.tsx";
import { DatabankRenameDialog } from "../components/databank-rename-dialog.tsx";
import {
  useAttachDocumentGlobal,
  useDetachDocumentGlobal,
  useReindexDocuments,
  useRemoveDocument,
  useRenameDocument,
} from "../hooks/use-databank-mutations.ts";
import { DATABANK_INGEST_GLOSS } from "../lib/databank-copy.ts";
import { ingestBadge, ingestPhase, ingestPollInterval } from "../lib/databank-model.ts";

/** How many pages the sliding window keeps. The rows are NOT virtualized, so an unbounded accumulation is
 *  what makes a paged list slower the longer you browse it — the `character.list` categorized-view bargain,
 *  carried: `maxPages × pageSize` bounds the render, and paging forward is what the user asked for. */
const MAX_PAGES = 5;
const SKELETON_ROW_COUNT = 6;

type DatabankListPage = inferOutput<Trpc["databank"]["list"]>;

// The paged read. `pageSize` is a PARAM the consumer supplies from `UserSettings.library.pageSize` (the
// character-library precedent — never a factory-internal settings read; tier direction).
//
// FRESHNESS rides the SAME bounded poll (D-3 arm b) through the model's shared `ingestPollInterval`, now
// over the FLATTENED pages: a document that lands mid-ingest on page 3 has to move the poll exactly as one
// on page 1 does, or browsing deeper would silently freeze the phase badges.
const useDatabankCollection = createCollectionSurface({
  query: (trpc: Trpc, params: { pageSize: number }) =>
    trpc.databank.list.infiniteQueryOptions(
      { limit: params.pageSize },
      {
        initialCursor: null,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        getPreviousPageParam: () => undefined,
        maxPages: MAX_PAGES,
        refetchInterval: (listQuery): number | false =>
          ingestPollInterval(
            listQuery.state.data?.pages.flatMap((page) => page.items),
            timeLib.now(),
          ),
      },
    ),
  itemsOf: (page: DatabankListPage) => page.items,
  idOf: (item: DocumentView) => item.id,
});

export function DatabankLibrarySurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack ref={surfaceRef} className="h-full outline-none" gap="block" tabIndex={-1}>
      <LibrarySurfaceShell errorLabel="your documents" loadingLabel="Loading your documents…">
        <DatabankList />
      </LibrarySurfaceShell>
    </Stack>
  );
}

function DatabankList(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const selectedId = useSelectedDocumentId();
  // The user's library page size (cache-first; the settings read is already loaded app-wide). Until it
  // resolves, the schema default — so the first page fetches at the same size either way.
  const settingsQuery = useQuery(trpc.settings.getUserSettings.queryOptions());
  const pageSize = settingsQuery.data?.config.library.pageSize ?? DEFAULT_USER_SETTINGS.library.pageSize;
  const collection = useDatabankCollection({ trpc }, { pageSize });
  const documents = collection.items;
  // THE CLOCK THE STALL THRESHOLD READS is the query's own `dataUpdatedAt` — "when these rows were true" —
  // not a mount-time snapshot and not an ambient read off render. It is pure (render-safe), and it ADVANCES:
  // every poll tick moves it, so a document that wedges while the pane is open flips to `Stalled` on the tick
  // that crosses the threshold. A `useState(() => now())` snapshot would freeze at mount and leave that
  // document reading `Queued` for as long as the tab stays open — the very hole this lane closes.
  const nowMs = collection.dataUpdatedAt;
  const { data: globalIds } = useSuspenseQuery(trpc.databank.listGlobal.queryOptions());

  const rename = useRenameDocument({ trpc, invalidation });
  const remove = useRemoveDocument({ trpc, invalidation });
  const reindex = useReindexDocuments({ trpc, invalidation });
  const attachGlobal = useAttachDocumentGlobal({ trpc, invalidation });
  const detachGlobal = useDetachDocumentGlobal({ trpc, invalidation });

  const [query, setQuery] = useState("");
  const [renameId, setRenameId] = useState<DocumentId | null>(null);
  const phaseFilter = useDatabankPhaseFilter();
  const deferredQuery = useDeferredValue(query);

  const needle = deferredQuery.trim().toLowerCase();
  // TWO scopes, composed: the typed name filter, and the PHASE scope home's health chips write (P2-a). The
  // phase is derived per row from the same clock the rows badge against, so the scope and the chips a user
  // just clicked can never disagree about which documents are stalled.
  const named: readonly DocumentView[] = needle === "" ? documents : documents.filter((doc) => doc.name.toLowerCase().includes(needle));
  const filtered: readonly DocumentView[] = phaseFilter === null ? named : named.filter((doc) => ingestPhase(doc, nowMs) === phaseFilter);
  const globals = new Set<DocumentId>(globalIds);

  const onToggleGlobal = (id: DocumentId, next: boolean): void => {
    if (next) {
      attachGlobal.mutate({ documentId: id });
    } else {
      detachGlobal.mutate({ documentId: id });
    }
  };

  const onDelete = (id: DocumentId): void => {
    // The open document is the one being deleted ⇒ CONTENT falls back to the welcome instead of rendering
    // a detail for a row the next list read will not contain.
    if (selectedId === id) {
      clearDocumentSelection();
    }
    remove.mutate({ id });
  };

  const renameTarget = documents.find((doc) => doc.id === renameId) ?? null;

  // The rows no longer suspend (a paged collection is a live query, not a Suspense read), so this pane owns
  // its own two pre-row states — the shell's boundary still covers the `listGlobal` set above.
  if (collection.error !== null) {
    return <QueryErrorState label="your documents" onRetry={collection.refetch} />;
  }
  if (collection.isPending) {
    return <SkeletonRows count={SKELETON_ROW_COUNT} />;
  }

  return (
    <>
      {phaseFilter === null ? null : <PhaseFilterChip phase={phaseFilter} />}
      <LibraryListLayout
        empty={
          <DatabankEmpty
            hasNextPage={collection.hasNextPage}
            isLoadingMore={collection.isFetchingNextPage}
            needle={needle}
            onLoadMore={collection.listProps.onEndApproach}
            phaseFilter={phaseFilter}
          />
        }
        isEmpty={filtered.length === 0}
        onSearchChange={setQuery}
        searchLabel="Search documents"
        searchPlaceholder="Search documents"
        searchValue={query}
      >
        {filtered.map((doc) => (
          <DatabankLibraryRow
            document={doc}
            global={globals.has(doc.id)}
            key={doc.id}
            nowMs={nowMs}
            onDelete={onDelete}
            onReindex={(id): void => reindex.mutate({ scope: { kind: "document", documentId: id } })}
            onRename={(id): void => setRenameId(id)}
            onSelect={selectDocumentFromList}
            onToggleGlobal={onToggleGlobal}
            selected={doc.id === selectedId}
          />
        ))}
        {/* THE TAIL FETCH. A plain scroll container has no `onEndApproach` of its own (the virtualized
            character list wires one; this pane's rows are not virtualized), so the guarded next-page fetch
            rides an explicit control — the `CharacterCategorizedList` precedent, same guard, same copy. It
            disappears when `nextCursor` comes back null, which is the only honest "you have seen the whole
            bank" signal the client gets. */}
        {collection.hasNextPage ? (
          <Button disabled={collection.isFetchingNextPage} intent="ghost" onClick={collection.listProps.onEndApproach}>
            Load more
          </Button>
        ) : null}
      </LibraryListLayout>

      {renameTarget === null ? null : (
        <DatabankRenameDialog
          currentName={renameTarget.name}
          onOpenChange={(next): void => {
            if (!next) {
              setRenameId(null);
            }
          }}
          onRename={(name): void => rename.mutate({ id: renameTarget.id, name })}
          open={true}
        />
      )}
    </>
  );
}

interface DatabankEmptyProps {
  readonly needle: string;
  readonly phaseFilter: IngestPhase | null;
  readonly hasNextPage: boolean;
  readonly isLoadingMore: boolean;
  readonly onLoadMore: () => void;
}

/** The pane's FOUR honest empties, never one generic "nothing here" — a bank with nothing in it teaches
 *  the first step, a search with no hits says so, a PHASE SCOPE with no matches is the good-news case
 *  ("nothing is stalled") that must offer its own way out, or a scoped pane reads as an empty bank
 *  (side-eye 2026-08-08 P2-a) — and, first of all, an UNFINISHED bank must not claim "no matches" about
 *  documents it has not fetched. Split out of the list body, which the arms pushed past the complexity
 *  ceiling — four empty states is a component's worth of decision. */
function DatabankEmpty({ needle, phaseFilter, hasNextPage, isLoadingMore, onLoadMore }: DatabankEmptyProps): ReactElement {
  if (hasNextPage) {
    // MORE BANK EXISTS than has been fetched, so "No matches" would be a claim this client cannot make: the
    // filters run over the LOADED pages only. The house's ruled answer (character library) — name what was
    // actually searched, and make the next page the next step. The scope's own way out is still one click
    // away: a phase scope keeps its clear-chip above this list.
    return (
      <EmptyState
        action={
          <Button disabled={isLoadingMore} intent="secondary" onClick={onLoadMore} size="sm">
            Load more
          </Button>
        }
        description="None among the loaded documents — load more to keep looking."
        icon={<Icon icon={Search} size="lg" />}
        title="No matches in view"
      />
    );
  }
  if (phaseFilter !== null) {
    return (
      <EmptyState
        action={
          <Button intent="secondary" onClick={clearDatabankPhaseFilter} size="sm">
            Show every document
          </Button>
        }
        description={`Nothing in your databank is ${ingestBadge(phaseFilter).label.toLowerCase()}${needle === "" ? "" : " under that search"}.`}
        icon={<Icon icon={Search} size="lg" />}
        title="No documents in that state"
      />
    );
  }
  return (
    <EmptyState
      action={
        needle === "" ? (
          <Button intent="secondary" onClick={(): void => openModal("addDocument")} size="sm">
            Add a document
          </Button>
        ) : undefined
      }
      description={needle === "" ? DATABANK_INGEST_GLOSS : "No document matches your search."}
      icon={<Icon icon={needle === "" ? FileText : Search} size="lg" />}
      title={needle === "" ? "No documents yet" : "No matches"}
    />
  );
}

/** The active phase scope + its way out — the `chat-list-filter` clear-chip grammar, so a scope the user
 *  arrived with from another section is visible and one click from gone. */
function PhaseFilterChip({ phase }: { readonly phase: IngestPhase }): ReactElement {
  const badge = ingestBadge(phase);
  return (
    <Row align="center" gap="field">
      <Text voice="kicker">Filtered:</Text>
      <Badge intent={badge.intent} size="sm" tone="soft">
        {badge.label}
      </Badge>
      <Button aria-label={`Clear the ${badge.label} filter`} intent="ghost" onClick={clearDatabankPhaseFilter} size="icon" type="button">
        <Icon icon={X} size="sm" />
      </Button>
    </Row>
  );
}
