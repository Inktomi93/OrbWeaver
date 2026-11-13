// The Databank CONTENT pane — the open document's detail, or the teaching
// welcome when nothing is selected (an empty CONTENT pane reads as unbuilt, so the empty state is required),
// or — on an EMPTY bank — a heading and a note beside the LIST's own empty state (the pane mints no Add
// button of its own; `welcomeCopy`'s note states the rule).
//
// `form` TIER (density §3.1 "entity editor"): identity header → Details group → Maintenance → Source text.
//
// THIS PANE OWNS ITS SCROLL, and that is not decoration: the shell's CONTENT region (`.shell-content` /
// `.shell-region-fill`) is a bounded flex box carrying NO overflow, so a surface that does not declare
// `h-full min-h-0 overflow-y-auto overscroll-contain` simply has its tail unreachable. A document's Details block plus a revealed source text is exactly that shape.
//
// SOURCE TEXT is a read-only SCROLL REGION, not a `Textarea` (§2.2's rejected primitive): legacy dumped the
// canon into a form control, which announces as an editable textbox, invites an edit that cannot be saved,
// and does an instrument's job with a form part. It is also a SEPARATE read under its own boundary
// (`get({includeText:true})`, legacy's own good call) so revealing megabytes never re-suspends the header.
// Chunk-boundary visualization is deliberately NOT designed — no server read exposes chunk text.

import { ingestPhase } from "@orb/contracts/databank";
import type { DocumentId } from "@orb/kit/ids";
import { formatBytes } from "@orb/kit/strings";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { FileText, Icon, Pencil, RefreshCw } from "@orb/ui/icons";
import { Grid, Row, Section, Stack } from "@orb/ui/layout";
import { ScrollArea } from "@orb/ui/scroll-area";
import { Heading, Text } from "@orb/ui/text";
import { useToastManager } from "@orb/ui/toast";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { DetailHeader, EditorPage, QueryBoundary, Tip } from "#components";
import { QueryErrorState, QueryUnavailableState, SkeletonRows, useInvalidation, useSuspenseQuery, useTRPC } from "#data";
import { renameActionName, timeLib, useFocusOnMount } from "#lib";
import { LIST_OFF_SCREEN_HINT, useSectionListMode, useSelectedDocumentId } from "#state";
import { DatabankRenameDialog } from "../components/databank-rename-dialog.tsx";
import { useReindexDocuments, useRenameDocument } from "../hooks/use-databank-mutations.ts";
import { DATABANK_EMPTY_BANK_NOTE } from "../lib/databank-copy.ts";
import { characterCount, documentTypeLabel, ingestBadge, ingestEmptyHint, ingestStallHint, originLabel, passageTally } from "../lib/databank-model.ts";
import {
  DATABANK_DETAIL_FACTS_KICKER,
  DATABANK_DETAIL_MAINTENANCE_KICKER,
  DATABANK_DETAIL_SOURCE_KICKER,
  DATABANK_LANDING_NAME,
  DATABANK_REBUILD_DOCUMENT_NAME,
  DATABANK_REBUILD_HINT,
  databankSourceToggleName,
} from "../lib/databank-names.ts";

export function DatabankDetailSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const documentId = useSelectedDocumentId();
  // THIS PANE STANDS DOWN WHEN NOTHING IS OPEN — the config workspace's precedent verbatim
  // (`config-content-surface.tsx`). Both databank surfaces call `useFocusOnMount` on their own root and
  // CONTENT mounts SECOND, so an unconditional call would put a keyboard user on this welcome — last in the
  // DOM, a full wrap past the library they came to read — and overwrite the LIST's own call. Which pane wins must be a DECISION, not
  // effect-order roulette: with nothing open the LIST is what the reader arrived for; the moment a
  // document IS open this pane is where they asked to be, so it takes focus again. The gate stays
  // satisfied (the surface still manages its own arrival focus — it simply knows when the arrival is not
  // its), so no `@surface-focus-elsewhere` marker is owed here.
  useFocusOnMount(surfaceRef, documentId !== null);

  return (
    <Stack scroll="y" height="fill" focusTarget={true} data-slot="databank-content" ref={surfaceRef} tabIndex={-1}>
      {documentId === null ? (
        <DatabankWelcome />
      ) : (
        /* RESERVED. Every document swap re-suspends this pane; without a reservation the CONTENT column
           collapses to a one-line sentence and springs back on each pick, scroll offset with it. The
           remembered box is a good predictor here: the readout's anatomy
           (header, chips, chunk counts, sections) is the same shape for every document. The scroll box
           is the Stack ABOVE this boundary, so the measuring wrapper sits inside it. */
        <QueryBoundary
          resetKeys={[documentId]}
          fallback={<SkeletonRows count={5} />}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="this document" onRetry={retry} />}
          reserveKey="databank.detail"
        >
          <DetailBody documentId={documentId} />
        </QueryBoundary>
      )}
    </Stack>
  );
}

/** What this pane will show once a document is open — the instruction, on a populated bank.
 *
 *  SIDE-AGNOSTIC (the chat landing's own rule): the LIST pane is
 *  a docked column, a slide-over, or collapsed — "on the left" is wrong in three of those and wrong on every
 *  phone, where the panes stack. */
const PICK_A_DOCUMENT = "Pick a document from the list to see what was extracted, how much of it is indexed, and where it fires.";

/** With the LIST off screen the empty bank has no other voice, so this pane is its one empty state and names the shell control that brings the one Add back. */
const EMPTY_BANK_COLLAPSED =
  "Your databank holds reference documents, indexed so the relevant ones can be pulled into your chats. Show list panel in the top bar opens the library, where a document gets added.";

/**
 * The no-selection arm — what this PANE will show once a document is open.
 *
 * A populated bank names the door too: "Pick a document from the list" presupposes a list on screen, which is
 * false when the list auto-collapses or is hand-collapsed. Same signal and the same verbatim affordance name
 * as the Presets welcome.
 *
 * An EMPTY bank has one empty state, never two. With the LIST on screen it is the LIST's, which owns the Add
 * door; this pane then draws a heading and a note, not an empty state. With the LIST off screen this pane is
 * the only voice, so it is the empty state and names the control that brings the library back. Neither arm
 * mints a second Add button.
 *
 * The census is `databank.bankHealth`, the read the home tile's chips use, so "is the bank empty" has one home
 * and cannot disagree with the list pane's own `totalCount`. While it is in flight the pane renders nothing: a
 * welcome shown and then withdrawn is a claim made and retracted.
 */
function welcomeCopy(total: number, listCollapsed: boolean): string {
  if (total === 0) {
    return EMPTY_BANK_COLLAPSED;
  }
  return listCollapsed ? `${PICK_A_DOCUMENT}${LIST_OFF_SCREEN_HINT}` : PICK_A_DOCUMENT;
}

function DatabankWelcome(): ReactElement {
  const trpc = useTRPC();
  const listMode = useSectionListMode("databank");
  const census = useQuery(trpc.databank.bankHealth.queryOptions());
  // `data-ready`: the pane has no skeleton, so its root declares when the first read has settled or cannot proceed (data,
  // error, or paused offline: `isLoading` is a read in flight). The
  // root persists across the read, so a section swap holds the outgoing view for it and shell/motion.css fades it in.
  return (
    <Stack align="center" minHeight="shrinks" height="fill" justify="center" data-ready={census.isLoading ? "false" : "true"}>
      {census.data === undefined && !census.isLoading ? (
        <QueryUnavailableState
          label="your databank"
          onRetry={(): void => {
            census.refetch().catch((error: unknown) => globalThis.reportError(error));
          }}
          paused={census.isPaused}
        />
      ) : null}
      {census.data === undefined ? null : <WelcomeBody listCollapsed={listMode === "collapsed"} total={census.data.total} />}
    </Stack>
  );
}

function WelcomeBody({ total, listCollapsed }: { readonly total: number; readonly listCollapsed: boolean }): ReactElement {
  if (total === 0 && !listCollapsed) {
    return (
      <Stack align="center" gap="field">
        <Heading level={2} voice="focal">
          {DATABANK_LANDING_NAME}
        </Heading>
        <Text cap="prose" textAlign="center" voice="gloss">
          {DATABANK_EMPTY_BANK_NOTE}
        </Text>
      </Stack>
    );
  }
  return (
    // action={null}: the Databank CONTENT landing. It nudges a pick (populated bank) or, with the list off screen, stands in for the list's empty state and points at the one Add door, which lives in the sibling list (the band's Add and the empty bank's own CTA); minting a second Add button here is the refused two-Add-doors arm. Ends if the library stops carrying a create door.
    <EmptyState action={null} description={welcomeCopy(total, listCollapsed)} icon={<Icon icon={FileText} size="lg" />} title={DATABANK_LANDING_NAME} />
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
  const emptyHint = ingestEmptyHint(doc);

  const onReindex = (): void => {
    reindex.mutate(
      { scope: { kind: "document", documentId } },
      {
        onSuccess: (): void => {
          toast.add({ title: "Rebuilding the search index. The counts refresh as it runs." });
        },
      },
    );
  };

  return (
    // The document's editor column: the cap every sibling member editor keeps, centered and breathing.
    <EditorPage data-slot="databank-detail-editor" gap="section" inset="section">
      <DetailHeader
        actions={
          <Tip text={renameActionName(doc.name)}>
            <Button aria-label={renameActionName(doc.name)} variant="ghost" onClick={(): void => setRenameOpen(true)} square={true}>
              <Icon icon={Pencil} size="sm" />
            </Button>
          </Tip>
        }
        // The detail keeps its phase chip: here it answers the question the reader asked by opening the
        // document. State belongs in `meta`; the act-now glyph rides it too, one chip anatomy in both panes.
        meta={
          <Badge tone={badge.tone} size="sm">
            {badge.glyph === null ? null : <Icon icon={badge.glyph} size="xs" />}
            {badge.label}
          </Badge>
        }
        title={doc.name}
      >
        {/* The empty phase's remedy sits under the name, where a reader asking "why is this Empty?" looks:
              Reindex is the wrong advice for this state, so it is not in Maintenance. */}
        {emptyHint === null ? null : <Text voice="gloss">{emptyHint}</Text>}
      </DetailHeader>

      {/* `kicker`, not `heading` — CD1 (section.tsx's own doc): a read-only GROUPING gets the micro-caps
            name plus a hairline to the edge, which is what 20+ sibling features spell and what the mock
            draws. `heading` is the settings-pane form contract, and this pane is a readout. */}
      <Section kicker={DATABANK_DETAIL_FACTS_KICKER}>
        {/* ONE grid, not a stack of rows: the label track is `max-content` (as wide as the widest label,
              no wider) and every value still starts at ONE x, which a per-row measurement cannot promise.
              See `cols="readout"`'s own note for why the knob-row token stopped being right here. */}
        <Grid align="baseline" cols="readout" gap="row">
          <DetailRow label="Origin" value={originLabel(doc.origin)} />
          <DetailRow label="Type" value={documentTypeLabel(doc.mime)} />
          <DetailRow label="Size" value={formatBytes(doc.byteSize)} />
          {/* THE LABEL CARRIES THE UNIT: the values are bare numbers, grouped
                by the feature's one number convention — "Passages 12", never "Passages 12 passages". The
                row SUBTITLE keeps the noun, because a scent line has no label to carry it. */}
          <DetailRow label="Characters" value={characterCount(doc)} />
          {/* PASSAGES, not "Chunks" — the list row and this readout print one fact and used to print it
                in two vocabularies ("12 passages" there, "Chunks 12 / 12 embedded" here). One home:
                `passageTally` / `passageCount` (databank-model). */}
          <DetailRow label="Passages" value={passageTally(doc)} />
          <DetailRow label="Added" value={timeLib.formatDate(doc.createdAt)} />
          <DetailRow label="Updated" value={timeLib.formatDate(doc.updatedAt)} />
          {doc.sourceUrl === null ? null : <DetailRow label="Source" value={doc.sourceUrl} />}
        </Grid>
      </Section>

      <Section kicker={DATABANK_DETAIL_MAINTENANCE_KICKER}>
        <Stack gap="row">
          {/* THE PARAGRAPH TAKES THE READING MEASURE, THE BLOCK ABOVE KEEPS THE CONTROL ONE: "a block
                holding controls keeps the wider measure while the paragraph inside it takes this one". The
                content column alone would run this sentence well past the design law's characters-per-line
                band. `--reading-measure-prose` resolves in this paragraph's own gloss font — a `ch` on the
                wrapper would resolve at the wrong scale, which the token's contract names.
                AND `justify="start"`, NOT `between` — a cap alone would pay for the measure with a hand-span
                between the sentence and the button that acts on it ("a measure caps the worst case; it does
                not tie the pair"). The button rides its own sentence. */}
          <Row align="center" wrap={true} gap="row" justify="start">
            <Text className="min-inline-0" cap="prose" floor="field" grow={true} voice="gloss">
              {DATABANK_REBUILD_HINT}
            </Text>
            <Button className="shrink-0" disabled={reindex.isPending} variant="outline" onClick={onReindex} size="sm" wrap={true}>
              <Icon icon={RefreshCw} size="sm" />
              {DATABANK_REBUILD_DOCUMENT_NAME}
            </Button>
          </Row>
          {/* A stuck-ingest signal: a doc parked in Queued/Indexing well past its last update likely
                wedged — point the user at Reindex (derived from `updatedAt`; there is no status column). */}
          {stallHint === null ? null : <Text voice="gloss">{stallHint}</Text>}
        </Stack>
      </Section>

      <Section kicker={DATABANK_DETAIL_SOURCE_KICKER}>
        <Stack gap="row">
          <Row justify="start">
            <Button variant="ghost" onClick={(): void => setShowSource((prev) => !prev)} size="sm">
              <Icon icon={FileText} size="sm" />
              {databankSourceToggleName(showSource)}
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
    </EditorPage>
  );
}

/** The lazy full-text read — a separate query under its own boundary, so revealing it never re-suspends the
 *  header (which is exactly why the contract splits `get` from `get({includeText:true})`). */
function SourceText({ documentId }: { readonly documentId: DocumentId }): ReactElement {
  return (
    <QueryBoundary
      resetKeys={[documentId]}
      fallback={<SkeletonRows count={3} shape="line" />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="the source text" onRetry={retry} />}
    >
      <SourceTextBody documentId={documentId} />
    </QueryBoundary>
  );
}

function SourceTextBody({ documentId }: { readonly documentId: DocumentId }): ReactElement {
  const trpc = useTRPC();
  const query = useSuspenseQuery(trpc.databank.get.queryOptions({ id: documentId, includeText: true }));
  return (
    // A read-only scroll REGION, not a form control (§2.2): the text is a readout, and `whitespace-pre-wrap`
    // is what keeps the extracted line structure legible.
    <ScrollArea maxHeight="scrollLg" wrapContent={true}>
      <Text cap="prose" whitespace="preWrap" wrap="word" prose={true}>
        {query.data.extractedText ?? ""}
      </Text>
    </ScrollArea>
  );
}

/**
 * One readout row: a LABEL COLUMN, then its value immediately beside it.
 *
 * Not `justify="between"` — label hard left, value hard right — which is the settings-row grammar and is
 * wrong for a readout: the pair spends whatever width it is given, and the eye has to travel a hand-span to
 * tie a two-word label to a one-word value. A measure caps the WORST case; it does not tie the pair.
 *
 * A COLUMN does: the value starts at ONE x on every row, at every pane width — a RANGE property rather than
 * a point fix, because there is no gap left to grow.
 *
 * THE COLUMN IS `max-content`, NOT THE KNOB-ROW TOKEN. `w-(--width-label-col)` is a CONTROL column — the
 * width that makes sliders and number fields start at one x down a settings pane — and spent on short
 * readout labels it leaves a gap inside every row. One column, values at one x — the rows are cells of ONE
 * `cols="readout"` grid, whose label track is exactly as wide as the widest label. Which is also why this
 * returns a FRAGMENT: a wrapping Row would be one grid item, and the shared track would be gone.
 */
function DetailRow({ label, value }: { readonly label: string; readonly value: string }): ReactElement {
  return (
    <>
      <Text voice="gloss">{label}</Text>
      <Text truncate={true}>{value}</Text>
    </>
  );
}
