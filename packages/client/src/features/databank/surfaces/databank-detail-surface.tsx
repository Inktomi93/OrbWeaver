// The Databank CONTENT pane — the open document's detail (databank-surface-spec §6.2), or the teaching
// welcome when nothing is selected (an empty CONTENT pane reads as unbuilt: empty states are load-bearing).
//
// `form` TIER (density §3.1 "entity editor"): identity header → Details group → Maintenance → Source text.
//
// THIS PANE OWNS ITS SCROLL, and that is not decoration: the shell's CONTENT region (`.shell-content` /
// `.shell-region-fill`) is a bounded flex box carrying NO overflow, so a surface that does not declare
// `h-full min-h-0 overflow-y-auto` simply has its tail unreachable — measured on the config workspace (R2WI)
// with a 60-entry book. A document's Details block plus a revealed source text is exactly that shape.
//
// SOURCE TEXT is a read-only SCROLL REGION, not a `Textarea` (§2.2's rejected primitive): legacy dumped the
// canon into a form control, which announces as an editable textbox, invites an edit that cannot be saved,
// and does an instrument's job with a form part. It is also a SEPARATE non-suspending read
// (`get({includeText:true})`, legacy's own good call) so revealing megabytes never re-suspends the header.
// Chunk-boundary visualization is deliberately NOT designed — no server read exposes chunk text.

import type { DocumentId } from "@orb/kit/ids";
import { formatBytes } from "@orb/kit/strings";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { FileText, Icon, Pencil, RefreshCw } from "@orb/ui/icons";
import { Container, Row, Section, Stack, Surface } from "@orb/ui/layout";
import { ScrollArea } from "@orb/ui/scroll-area";
import { Heading, Text } from "@orb/ui/text";
import { useToastManager } from "@orb/ui/toast";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import { timeLib, useFocusOnMount } from "#lib";
import { useSelectedDocumentId } from "#state";
import { DatabankRenameDialog } from "../components/databank-rename-dialog.tsx";
import { useReindexDocuments, useRenameDocument } from "../hooks/use-databank-mutations.ts";
import { DATABANK_INGEST_GLOSS } from "../lib/databank-copy.ts";
import { documentSubtitle, ingestBadge, ingestPhase, ingestStallHint, originLabel } from "../lib/databank-model.ts";

export function DatabankDetailSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  const documentId = useSelectedDocumentId();

  return (
    <Container className="h-full min-h-0">
      <Stack className="relative h-full min-h-0 overflow-y-auto outline-none" data-slot="databank-content" ref={surfaceRef} tabIndex={-1}>
        {documentId === null ? (
          <DatabankWelcome />
        ) : (
          <QueryBoundary
            fallback={<Text voice="gloss">Loading the document…</Text>}
            renderError={(_error, retry): ReactElement => <QueryErrorState label="this document" onRetry={retry} />}
          >
            <DetailBody documentId={documentId} />
          </QueryBoundary>
        )}
      </Stack>
    </Container>
  );
}

/** The no-selection arm — what the bank IS, and what a document does once it is in it. The description is
 *  the SHARED gloss (one spelling of the mechanism, `databank-copy`) plus this pane's OWN second sentence:
 *  the part only CONTENT can say, about the pane to its left. It used to re-word the mechanism itself
 *  ("chunked and embedded"), one of four drifted spellings (side-eye 2026-08-08 P2-c). */
function DatabankWelcome(): ReactElement {
  return (
    <EmptyState
      description={`${DATABANK_INGEST_GLOSS} Pick one on the left to see what was indexed, or add another.`}
      icon={<Icon icon={FileText} size="lg" />}
      title="Your databank"
    />
  );
}

function DetailBody({ documentId }: { readonly documentId: DocumentId }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const toast = useToastManager();
  // Same clock rule the library row follows: `dataUpdatedAt` is "when this document was true", so the stall
  // verdict here and the chip on the list row can never disagree about the same document.
  const { data: doc, dataUpdatedAt: nowMs } = useSuspenseQuery(trpc.databank.get.queryOptions({ id: documentId }));
  const rename = useRenameDocument({ trpc, invalidation });
  const reindex = useReindexDocuments({ trpc, invalidation });
  const [renameOpen, setRenameOpen] = useState(false);
  const [showSource, setShowSource] = useState(false);

  const badge = ingestBadge(ingestPhase(doc, nowMs));
  const stallHint = ingestStallHint(doc, nowMs);

  const onReindex = (): void => {
    reindex.mutate(
      { scope: { kind: "document", documentId } },
      {
        onSuccess: (): void => {
          toast.add({ title: "Reindexing started — the chunk counts refresh as it runs." });
        },
      },
    );
  };

  return (
    <Surface tier="form">
      {/* `max-w-prose` — the MEASURE every sibling member editor in the app keeps (tag / regex member
          surfaces). Without it a `justify="between"` label/value row spent the whole CONTENT pane: at the
          1448px desktop pane "Origin" sat at x=496 and "Text" at x=1387, 890px of nothing between a label
          and its own value, and Reindex flew to the far edge of its sentence. That is the same defect the
          tag editor's two colour swatches were fixed for (side-eye 2026-08-03: "a two-column grid got
          stretched across 590px for two 32px squares"), rebuilt in a pane with twice the room. */}
      <Stack className="max-w-prose" gap="section" padding="section">
        <Row align="start" gap="field" justify="between">
          <Stack className="min-w-0" gap="tight">
            <Heading level={2}>{doc.name}</Heading>
            <Text voice="gloss">{documentSubtitle(doc)}</Text>
          </Stack>
          <Row align="center" gap="field">
            {/* The DETAIL keeps its `Ready` chip — §6.1's ruling deletes the chip from the LIST ROW, where
                it was chrome on six rows in seven; here it is the answer to the question the user asked by
                opening the document. */}
            <Badge intent={badge.intent} size="sm" tone="soft">
              {badge.label}
            </Badge>
            <Button aria-label={`Rename ${doc.name}`} intent="ghost" onClick={(): void => setRenameOpen(true)} size="icon" title="Rename">
              <Icon icon={Pencil} size="sm" />
            </Button>
          </Row>
        </Row>

        <Section heading="Details">
          <Stack gap="row">
            <DetailRow label="Origin" value={originLabel(doc.origin)} />
            <DetailRow label="Type" value={doc.mime} />
            <DetailRow label="Size" value={formatBytes(doc.byteSize)} />
            <DetailRow label="Characters" value={String(doc.charCount)} />
            <DetailRow label="Chunks" value={`${String(doc.embeddedCount)} / ${String(doc.chunkCount)} embedded`} />
            <DetailRow label="Added" value={timeLib.formatDate(doc.createdAt)} />
            <DetailRow label="Updated" value={timeLib.formatDate(doc.updatedAt)} />
            {doc.sourceUrl === null ? null : <DetailRow label="Source" value={doc.sourceUrl} />}
          </Stack>
        </Section>

        <Section heading="Maintenance">
          <Stack gap="row">
            <Row align="center" gap="row" justify="between">
              <Text voice="gloss">Re-chunk and re-embed this document — after a settings change, or to heal a partial index.</Text>
              <Button disabled={reindex.isPending} intent="secondary" onClick={onReindex} size="sm">
                <Icon icon={RefreshCw} size="sm" />
                Reindex
              </Button>
            </Row>
            {/* A stuck-ingest signal: a doc parked in Queued/Indexing well past its last update likely
                wedged — point the user at Reindex (derived from `updatedAt`; there is no status column). */}
            {stallHint === null ? null : <Text voice="gloss">{stallHint}</Text>}
          </Stack>
        </Section>

        <Section heading="Source text">
          <Stack gap="row">
            <Row justify="start">
              <Button intent="ghost" onClick={(): void => setShowSource((prev) => !prev)} size="sm">
                <Icon icon={FileText} size="sm" />
                {showSource ? "Hide source text" : "View source text"}
              </Button>
            </Row>
            {showSource ? <SourceText documentId={documentId} /> : null}
          </Stack>
        </Section>

        <DatabankRenameDialog
          currentName={doc.name}
          onOpenChange={setRenameOpen}
          onRename={(name): void => rename.mutate({ id: documentId, name })}
          open={renameOpen}
        />
      </Stack>
    </Surface>
  );
}

/** The lazy full-text read — a separate NON-suspending query, so revealing it never re-suspends the header
 *  (which is exactly why the contract splits `get` from `get({includeText:true})`). */
function SourceText({ documentId }: { readonly documentId: DocumentId }): ReactElement {
  const trpc = useTRPC();
  const query = useQuery(trpc.databank.get.queryOptions({ id: documentId, includeText: true }));

  if (query.isPending) {
    return <Text voice="gloss">Loading the source text…</Text>;
  }
  if (query.isError) {
    return (
      <Text className="text-destructive" voice="gloss">
        Couldn't load the source text.
      </Text>
    );
  }
  return (
    // A read-only scroll REGION, not a form control (§2.2): the text is a readout, and `whitespace-pre-wrap`
    // is what keeps the extracted line structure legible.
    <ScrollArea className="max-h-96">
      <Text className="whitespace-pre-wrap break-words" voice="datum">
        {query.data.extractedText ?? ""}
      </Text>
    </ScrollArea>
  );
}

function DetailRow({ label, value }: { readonly label: string; readonly value: string }): ReactElement {
  return (
    <Row align="center" gap="field" justify="between">
      <Text voice="gloss">{label}</Text>
      <Text className="min-w-0 truncate text-right">{value}</Text>
    </Row>
  );
}
