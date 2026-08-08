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
// SEARCH is the client-side name filter, matching world-info/presets. `databank.list` accepts an `origin`
// facet; NOT built, by ruling (D-5) — no evidence of need at observed bank sizes.

import type { DocumentView } from "@orb/contracts/databank";
import type { DocumentId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { FileText, Icon, Search, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useDeferredValue, useRef, useState } from "react";
import { LibraryListLayout, LibrarySurfaceShell } from "#components";
import { useInvalidation, useTRPC } from "#data";
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
  // THE CLOCK THE STALL THRESHOLD READS is the query's own `dataUpdatedAt` — "when these rows were true" —
  // not a mount-time snapshot and not an ambient read off render. It is pure (render-safe), and it ADVANCES:
  // every poll tick moves it, so a document that wedges while the pane is open flips to `Stalled` on the tick
  // that crosses the threshold. A `useState(() => now())` snapshot would freeze at mount and leave that
  // document reading `Queued` for as long as the tab stays open — the very hole this lane closes.
  const { data: documents, dataUpdatedAt: nowMs } = useSuspenseQuery({
    ...trpc.databank.list.queryOptions({}),
    // The predicate reads the LIVE cached rows, so the poll starts itself when an add lands an in-flight
    // row and stops itself on the tick that finds none — INCLUDING the tick that finds a row has stalled
    // (a wedged document is not in flight, and polling it forever is a request every 4s for a job that is
    // never coming back). The clock here is per-tick, since a callback is not a render path. The rule
    // itself lives in the model, shared with home's databank tile (the list's other reader).
    refetchInterval: (listQuery): number | false => ingestPollInterval(listQuery.state.data, timeLib.now()),
  });
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

  return (
    <>
      {phaseFilter === null ? null : <PhaseFilterChip phase={phaseFilter} />}
      <LibraryListLayout
        empty={<DatabankEmpty needle={needle} phaseFilter={phaseFilter} />}
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

/** The pane's THREE honest empties, never one generic "nothing here" — a bank with nothing in it teaches
 *  the first step, a search with no hits says so, and a PHASE SCOPE with no matches is the good-news case
 *  ("nothing is stalled") that must offer its own way out, or a scoped pane reads as an empty bank
 *  (side-eye 2026-08-08 P2-a). Split out of the list body, which the third arm pushed past the complexity
 *  ceiling — three empty states is a component's worth of decision. */
function DatabankEmpty({ needle, phaseFilter }: { readonly needle: string; readonly phaseFilter: IngestPhase | null }): ReactElement {
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
