// The databank library surface — the Databank LIST hub. Reads `databank.list` + `databank.listGlobal`
// (D-1's id set, which is what lets the row's `Everywhere` toggle exist WITHOUT legacy's per-row
// `listAttachments` N+1) and renders a `DatabankLibraryRow` per document. A row click opens the document in
// CONTENT. The focus/QueryBoundary shell + the search/empty body come from the shared library-surface
// scaffold, so this pane's density is the same instrument tier presets and the config collections resolve to,
// by construction.
//
// EVERY LENS IS THE SERVER'S (owner ruling 2026-08-13, the `character.list` precedent — landed 2026-08-14).
// The name search and the ingest-PHASE scope ride as query INPUT, so they are part of the key and changing
// one resets the pages instead of filtering a stale window. What that fixed, and what this file used to say:
//   • The window was ≤150 rows (`maxPages: 5` × 30) with `getPreviousPageParam: () => undefined`, so a deep
//     scroll EVICTED the head pages unrecoverably. The cap is gone: pages accumulate, the DOM stays bounded
//     by `<VirtualList>` (the rows are light summaries), and nothing vanishes off the top.
//   • This header used to record "Server-side name search was NOT built … the house already ruled this shape
//     on the library that pages hardest." That ruling's own precedent — the character library — is what the
//     owner reversed, so the premise died rather than the reasoning being overturned in place. "No matches"
//     is now a claim this pane has standing to make, and the "None among the loaded documents — load more to
//     keep looking" hedge is gone with the window it described.
//   • The phase chip a user clicks on the HOME tile now scopes the whole bank, not the pages that happen to
//     be loaded (`state/databank-filter-store.ts` carries the amended D-5 note: no origin chip was added).
//   • The count the band header prints is the server's `totalCount`, not "loaded so far".
//
// FRESHNESS — D-3, THE SHIP-NOW ARM (b). There is no databank bus event and `UploadResult` does not carry
// the ingest `workloadId` today, so a freshly added document would sit at `Queued` until the user navigated
// away and back — legacy's single most visible "is it broken?" hole (§2.2). The bounded poll here closes it
// for EVERY producer and, unlike the push arm, also survives a reload (a workloadId held in component state
// does not): the list refetches on an interval ONLY while some row is in an in-flight ingest phase, and the
// interval evaluates to `false` the moment none is. A bank at rest makes zero extra requests.
// D-3 arm (a) — `workloadId` on `UploadResult` + the `BundleWorkloadTracker` subscription — remains the
// spec's recommendation for S5 and is strictly additive on top of this.

import type { DocumentView, IngestPhase } from "@orb/contracts/databank";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { DocumentId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { FileText, Icon, Search, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { VirtualList } from "@orb/ui/virtual-list";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { LibraryListLayout, LibrarySurfaceShell } from "#components";
import type { Trpc } from "#data";
import { createCollectionSurface, QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { timeLib, useDebouncedValue, useFocusOnMount } from "#lib";
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
import { ingestBadge, ingestPollInterval } from "../lib/databank-model.ts";

const SKELETON_ROW_COUNT = 6;
/** Initial row-height guess; `<VirtualList>` re-measures every row after mount. A two-line entity row. */
const ESTIMATED_ROW_PX = 72;

/** Keystroke→request damper for the server-side search (the character library's value). Long enough that
 *  typing a name is one query rather than eight, short enough that the list answers while you are looking. */
const SEARCH_DEBOUNCE_MS = 250;

type DatabankListPage = inferOutput<Trpc["databank"]["list"]>;

/** How a page flattens — declared ONCE and handed to both the collection and the poll predicate below. The
 *  poll callback is the one place that has to reach into the raw query cache (a `refetchInterval` runs inside
 *  the query options, before any collection exists), so it was the last site in the client re-spelling the
 *  page shape by hand; it reads through this instead. */
const itemsOf = (page: DatabankListPage): readonly DocumentView[] => page.items;

/** The pane's whole lens, as query INPUT — every field is part of the query key. */
interface DatabankLibraryParams {
  readonly pageSize: number;
  /** DEBOUNCED + trimmed; `""` is the unsearched bank. */
  readonly search: string;
  /** The home tile's health-chip scope; `null` = every phase. */
  readonly phase: IngestPhase | null;
}

// The paged read. `pageSize` is a PARAM the consumer supplies from `UserSettings.library.pageSize` (the
// character-library precedent — never a factory-internal settings read; tier direction).
//
// NO `maxPages`. It used to be 5 with `getPreviousPageParam: () => undefined`, so past 150 rows TanStack
// evicted the HEAD page and nothing could fetch it back — the same unrecoverable eviction the character
// library shipped (the 2026-08-13 dogfood P1). Windowing buys nothing now that `<VirtualList>` bounds the DOM.
//
// FRESHNESS rides the SAME bounded poll (D-3 arm b) through the model's shared `ingestPollInterval`, over the
// FLATTENED pages: a document that lands mid-ingest on page 3 has to move the poll exactly as one on page 1
// does, or browsing deeper would silently freeze the phase badges.
// THE POLL IS NOT REDUNDANT WITH THE DATABANK BUS EVENT, and must not be retired as such: the event fans at
// the ingest TERMINAL, while between enqueue and terminal the chunk counts tick and these phase chips move —
// and nothing emits per chunk (deliberately; that is the event-storm class). Poll = in-flight progress; bus =
// settlement.
const useDatabankCollection = createCollectionSurface({
  query: (trpc: Trpc, params: DatabankLibraryParams) =>
    trpc.databank.list.infiniteQueryOptions(
      {
        limit: params.pageSize,
        ...(params.search === "" ? {} : { search: params.search }),
        ...(params.phase === null ? {} : { phase: params.phase }),
      },
      {
        initialCursor: null,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        // NO `getPreviousPageParam`. It was `() => undefined` — inert by construction (this keyset only walks
        // forward), and half of what made the dropped `maxPages` cap unrecoverable: the head page could be
        // evicted and nothing could ask for it back. Removed rather than kept as a no-op, so the shape says
        // "forward-only" instead of implying a backward walk that was never wired.
        refetchInterval: (listQuery): number | false => ingestPollInterval(listQuery.state.data?.pages.flatMap(itemsOf), timeLib.now()),
      },
    ),
  itemsOf,
  idOf: (item: DocumentView) => item.id,
  totalOf: (page: DatabankListPage) => page.totalCount,
});

export function DatabankLibrarySurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack ref={surfaceRef} className="h-full outline-none" gap="block" tabIndex={-1}>
      {/* DELIBERATELY UNRESERVED, AND FOR A DIFFERENT REASON THAN #1748 RECORDED (re-derived on this tree).
          The sibling library pane (presets) was blocked by a scroll box under the boundary and is hoisted;
          this pane's body is a self-scrolling `<VirtualList className="h-full">`, which is not a box that can
          be hoisted — it IS the data-dependent list. `reserveKey`'s measuring Stack is auto-height, so it
          severs the virtual scroller's height chain and the list stops virtualizing; the only way through is
          `fill`, and `fill` reserves the PANE box, which this pane already owns from its parent and which
          never changes. There is nothing to remember, so it stays on the unsplit `LibraryListLayout` (whose
          rows container is that definite box) rather than gaining a reservation that could only be a
          tautology. The rows themselves do not suspend at all — see `DatabankList`'s own note. */}
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
  const [query, setQuery] = useState("");
  // DEBOUNCED, not deferred: deferring picks a render, and every distinct string here is a round trip now
  // that the predicate is the server's (the character library's ruling).
  const settledQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const phaseFilter = useDatabankPhaseFilter();
  const collection = useDatabankCollection({ trpc }, { pageSize, phase: phaseFilter, search: settledQuery });
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

  const [renameId, setRenameId] = useState<DocumentId | null>(null);
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
        empty={<DatabankEmpty needle={settledQuery} onClearSearch={(): void => setQuery("")} phaseFilter={phaseFilter} />}
        isEmpty={documents.length === 0}
        onSearchChange={setQuery}
        searchLabel="Search documents"
        searchPlaceholder="Search documents"
        searchValue={query}
      >
        {/* THE TAIL FETCH IS THE LIST'S OWN. The pane used to render every loaded row into a plain scroll
            container and hang the next-page fetch off an explicit "Load more" button, because a
            non-virtualized list has no `onEndApproach`. `<VirtualList>` has one — so the keyset walks itself
            as you scroll, the DOM stays bounded however deep the bank goes, and the button is gone rather
            than sitting under a virtualized viewport it could no longer be part of. */}
        <VirtualList
          aria-label="Documents"
          className="h-full"
          endApproachRows={collection.listProps.endApproachRows}
          estimateSize={(): number => ESTIMATED_ROW_PX}
          gapToken="tight"
          getItemKey={(item): string => item.id}
          items={documents}
          onEndApproach={collection.listProps.onEndApproach}
          renderItem={(doc): ReactElement => (
            <DatabankLibraryRow
              document={doc}
              global={globals.has(doc.id)}
              nowMs={nowMs}
              onDelete={onDelete}
              onReindex={(id): void => reindex.mutate({ scope: { kind: "document", documentId: id } })}
              onRename={(id): void => setRenameId(id)}
              onSelect={selectDocumentFromList}
              onToggleGlobal={onToggleGlobal}
              selected={doc.id === selectedId}
            />
          )}
        />
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
  /** Empties the search box — the no-match arm's way OUT (see the `DatabankEmpty` note). */
  readonly onClearSearch: () => void;
}

/** The pane's THREE honest empties, never one generic "nothing here" — a bank with nothing in it teaches the
 *  first step, a search with no hits says so, and a PHASE SCOPE with no matches is the good-news case
 *  ("nothing is stalled") that must offer its own way out, or a scoped pane reads as an empty bank (side-eye
 *  2026-08-08 P2-a).
 *
 *  THE FOURTH ARM IS GONE with the client-side window it existed for: "No matches in view — load more to keep
 *  looking" was the honest thing to say while the predicates ran over the loaded pages, and it is a dead end
 *  pretending to be a next step now that the server searched the whole bank (the character library's identical
 *  retirement, 2026-08-14).
 *
 *  EVERY ARM CARRIES ITS OWN WAY OUT (side-eye 2026-08-19 P2). The no-match arm used to render "No matches"
 *  and nothing else — a dead end with the SEARCH BOX above it as the only exit, and the box still holding
 *  the term that produced the state. The phase-scope arm two branches up had had its clear affordance since
 *  2026-08-08; this one was the arm that did not. It gets BOTH doors: put the bank back (Clear search), or
 *  make the thing you were looking for (Add a document) — the second is why an empty search result is not
 *  the same dead end as an empty phase scope. */
function DatabankEmpty({ needle, phaseFilter, onClearSearch }: DatabankEmptyProps): ReactElement {
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
  const add = (
    <Button intent={needle === "" ? "secondary" : "ghost"} onClick={(): void => openModal("addDocument")} size="sm">
      Add a document
    </Button>
  );
  return (
    <EmptyState
      action={
        needle === "" ? (
          add
        ) : (
          <Row align="center" gap="field" justify="center">
            <Button intent="secondary" onClick={onClearSearch} size="sm">
              Clear search
            </Button>
            {add}
          </Row>
        )
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
