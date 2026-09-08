// The Databank CONTENT pane — the open document's detail (databank-surface-spec §6.2), or the teaching
// welcome when nothing is selected (an empty CONTENT pane reads as unbuilt: empty states are load-bearing),
// or — on an EMPTY bank with the LIST on screen — nothing at all, because there the list's own empty state
// owns the first step and the only Add door (#434; `DatabankWelcome`'s note states the whole rule).
//
// `form` TIER (density §3.1 "entity editor"): identity header → Details group → Maintenance → Source text.
//
// THIS PANE OWNS ITS SCROLL, and that is not decoration: the shell's CONTENT region (`.shell-content` /
// `.shell-region-fill`) is a bounded flex box carrying NO overflow, so a surface that does not declare
// `h-full min-h-0 overflow-y-auto overscroll-contain` simply has its tail unreachable — measured on the config workspace (R2WI)
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
import { Container, Grid, Row, Section, Stack, Surface } from "@orb/ui/layout";
import { ScrollArea } from "@orb/ui/scroll-area";
import { Heading, Text } from "@orb/ui/text";
import { useToastManager } from "@orb/ui/toast";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { timeLib, useFocusOnMount } from "#lib";
import { LIST_OFF_SCREEN_HINT, useSectionListMode, useSelectedDocumentId } from "#state";
import { DatabankRenameDialog } from "../components/databank-rename-dialog.tsx";
import { useReindexDocuments, useRenameDocument } from "../hooks/use-databank-mutations.ts";
import {
  characterCount,
  documentSubtitle,
  ingestBadge,
  ingestEmptyHint,
  ingestPhase,
  ingestStallHint,
  originLabel,
  passageTally,
} from "../lib/databank-model.ts";

export function DatabankDetailSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const documentId = useSelectedDocumentId();
  // THIS PANE STANDS DOWN WHEN NOTHING IS OPEN (side-eye 2026-08-19 ARIA) — the config workspace's
  // precedent verbatim (`config-content-surface.tsx`, same finding one section over). Both databank
  // surfaces call `useFocusOnMount` on their own root and CONTENT mounts SECOND, so arriving in the
  // section put a keyboard user on this welcome — last in the DOM, a full wrap past the library they came
  // to read — and the LIST's own call was overwritten every time. Which pane wins must be a DECISION, not
  // effect-order roulette: with nothing open the LIST is what the reader arrived for; the moment a
  // document IS open this pane is where they asked to be, so it takes focus again. The gate stays
  // satisfied (the surface still manages its own arrival focus — it simply knows when the arrival is not
  // its), so no `@surface-focus-elsewhere` marker is owed here.
  useFocusOnMount(surfaceRef, documentId !== null);

  return (
    <Container className="h-full min-h-0">
      <Stack className="relative h-full min-h-0 overflow-y-auto overscroll-contain outline-none" data-slot="databank-content" ref={surfaceRef} tabIndex={-1}>
        {documentId === null ? (
          <DatabankWelcome />
        ) : (
          /* RESERVED (#1098). Every document swap re-suspends this pane, so the CONTENT column collapsed
             to a one-line sentence and sprang back to a full readout on each pick — the pane's scrollbar
             and scroll offset with it. The remembered box is a good predictor here: the readout's anatomy
             (header, chips, chunk counts, sections) is the same shape for every document. The scroll box
             is the Stack ABOVE this boundary, so the measuring wrapper sits inside it (#1133). */
          <QueryBoundary
            fallback={<SkeletonRows count={5} />}
            renderError={(_error, retry): ReactElement => <QueryErrorState label="this document" onRetry={retry} />}
            reserveKey="databank.detail"
          >
            <DetailBody documentId={documentId} />
          </QueryBoundary>
        )}
      </Stack>
    </Container>
  );
}

/** What this pane will show once a document is open — the instruction, on a populated bank.
 *
 *  SIDE-AGNOSTIC (side-eye 2026-08-19 N-10, the chat landing's own correction carried here): the LIST pane is
 *  a docked column, a slide-over, or collapsed — "on the left" is wrong in three of those and wrong on every
 *  phone, where the panes stack. */
const PICK_A_DOCUMENT = "Pick a document from the list to see what was extracted, how much of it is indexed, and where it fires.";

/**
 * The no-selection arm — what this PANE will show once a document is open, and NOTHING AT ALL while the bank
 * is empty and the LIST is on screen (#434, the #430 IA proposal).
 *
 * #445 — THE POPULATED ARM NAMES THE DOOR TOO. "Pick a document from the list" presupposes a list on screen,
 * which is false in the same three regimes the empty arm handles (narrow-desktop auto-collapse, focus mode, a
 * hand-collapsed pane) — the F-28 defect the Presets welcome was fixed for, left standing here by #434
 * because that lane's scope was the empty bank. Same signal, same conditional shape, same verbatim
 * affordance name; the instruction is unchanged for the reader who can see the list.
 *
 * THE EMPTY-BANK STAND-DOWN extends the ruling below one notch rather than reversing it. "An empty CONTENT
 * pane reads as unbuilt" still holds — it is why the two arms under it exist — but on an EMPTY bank the pane
 * was not empty, it was WRONG: "Pick a document from the list" names an act the reader cannot perform, three
 * feet from a LIST that is already teaching the real first step and already carrying the only Add door. Two
 * empty states in one glance saying nearly the same thing is the §13 IA duplication the side-eye report
 * filed; the one that has the affordance wins, and this pane stands down. (The REFUSED arm, recorded so the
 * next reader does not re-mint it: a second Add door here — see the two-Add-doors note below.)
 *
 * IT IS CONDITIONED ON THE LIST BEING ON SCREEN, not on the bank alone, because "the LIST owns the first
 * step" is only true when the list is showing. `panelDefaults.list` is `docked`, but the shell auto-collapses
 * a docked default in the narrow-desktop band and focus mode hides both panes — regimes where standing down
 * would leave the reader a blank pane and no door at all. There the pane keeps a teaching state and names the
 * affordance that produces the list, verbatim, exactly as the Presets welcome does (side-eye F-28).
 *
 * The census is `databank.bankHealth` — the SAME read the home tile's chips use, so "is the bank empty" has
 * one home and cannot disagree with the list pane's own `totalCount` for a reason this pane invented. While
 * it is in flight the pane renders nothing: a welcome shown and then withdrawn is a claim made and retracted,
 * and this read is warm on any path that has painted the home tile or the list band.
 *
 * IT NO LONGER PRINTS THE SHARED GLOSS (side-eye 2026-08-19 taste). The one-home copy fix of 2026-08-08 is
 * CORRECT and is not being forked: `DATABANK_INGEST_GLOSS` still has exactly one spelling. What that fix
 * created is a different defect — on an empty bank the LIST pane and this pane are both on screen and both
 * printed that same sentence (13px there, 15px here, and a third copy at 10.5px inside the Add modal), so
 * the product said one thing three times in one glance. The teaching sentence belongs to the surface that
 * owns the FIRST step, which is the LIST's empty state and the Add modal; this pane's job is to say what
 * happens when you pick something. So the slot changes, not the spelling.
 *
 * AND NO SECOND ADD DOOR. It used to end "…or add another" while rendering no button — an invitation with
 * no affordance, 226px from the LIST's real one (the two-Add-doors finding). The invitation goes rather
 * than a third button being minted for it.
 */
function DatabankWelcome(): ReactElement | null {
  const trpc = useTRPC();
  const listMode = useSectionListMode("databank");
  const census = useQuery(trpc.databank.bankHealth.queryOptions());

  if (census.data === undefined) {
    return null;
  }
  if (census.data.total === 0) {
    return listMode === "collapsed" ? (
      // @orb-waive empty-state-has-action(EmptyState): the Databank CONTENT teaching state for an EMPTY bank, whose copy already names the affordance that fixes it (Show list panel opens the library, which carries both create doors). The next step lives in the sibling list, so this state legitimately carries none of its own — the preset-library-welcome precedent. Ends if the library stops carrying a create door.
      <EmptyState
        description="Nothing is indexed yet. Show list panel in the top bar opens the library, where a document gets added."
        icon={<Icon icon={FileText} size="lg" />}
        title="Your databank"
      />
    ) : null;
  }
  return (
    // @orb-waive empty-state-has-action(EmptyState): the Databank CONTENT pick-a-document nudge shown alongside the library list, which itself carries both create doors (the band's Add primary and the empty bank's own CTA). The next step lives in the sibling list — the preset-library-welcome precedent, same species. Ends if the library stops carrying a create door.
    <EmptyState
      description={listMode === "collapsed" ? `${PICK_A_DOCUMENT}${LIST_OFF_SCREEN_HINT}` : PICK_A_DOCUMENT}
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
  const emptyHint = ingestEmptyHint(doc);

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
      {/* THE CAP every sibling member editor keeps (tag / regex / roster member surfaces). Without it a
          `justify="between"` label/value row spent the whole CONTENT pane: at the 1448px desktop pane
          "Origin" sat at x=496 and "Text" at x=1387, 890px of nothing between a label and its own value, and
          Reindex flew to the far edge of its sentence. That is the same defect the tag editor's two colour
          swatches were fixed for (side-eye 2026-08-03: "a two-column grid got stretched across 590px for two
          32px squares"), rebuilt in a pane with twice the room.
          IT IS `--width-content-col`, NOT `max-w-prose` (#1175). The ruling survives; its SPELLING changed.
          This block holds controls, and the prose measure's own contract forbids a reading `ch` cap on one
          (it resolves in the wrapper's font, not the paragraph's — the #213/#1130 failure). The editor
          content-column token is the one that names this job; `max-w-prose` was a third un-derived width.

          AND THE TOKEN'S CONSUMPTION IS THREE CLASSES, NOT ONE (#1664): its `$description` says the column
          is CENTERED and BREATHES to `--width-content-col-wide` once its container clears `@5xl`, so the
          bare cap left-pinned 720px inside a pane measured (snap --isolated, 2026-09-05) at 968px with both
          panels docked and 1864px in focus mode at 1920 — 1096px of dead void beside a 720px column, which
          is the defect the breathe step exists for. The query container here is the SHELL'S `content`
          region (`RegionAnchor`), not a box this surface owns: `<Surface>` is `display: contents`, so it
          adds none. `w-full` rides with `mx-auto` because that region is a flex column. */}
      <Stack
        className="mx-auto w-full max-w-(--width-content-col) @5xl:max-w-(--width-content-col-wide)"
        data-slot="databank-detail-editor"
        gap="section"
        padding="section"
      >
        <Row align="start" gap="field" justify="between">
          <Stack className="min-w-0" gap="tight">
            <Heading level={2}>{doc.name}</Heading>
            <Text voice="gloss">{documentSubtitle(doc)}</Text>
            {/* THE EMPTY PHASE'S REMEDY (side-eye 2026-08-19 N-5). It rides HERE, under the scent, and not
                in Maintenance beside the stall hint: Reindex is that hint's repair and it is the wrong
                advice for this state — re-running extraction over the same image-only bytes returns the
                same nothing. It sits directly under the chip that names the state, which is where a reader
                who just opened the row to ask "why is this Empty?" is looking. */}
            {emptyHint === null ? null : <Text voice="gloss">{emptyHint}</Text>}
          </Stack>
          <Row align="center" gap="field">
            {/* The DETAIL keeps its `Ready` chip — §6.1's ruling deletes the chip from the LIST ROW, where
                it was chrome on six rows in seven; here it is the answer to the question the user asked by
                opening the document. */}
            <Badge intent={badge.intent} size="sm" tone="soft">
              {/* The act-now glyph rides here too — one chip anatomy, both panes (databank-model's
                  INGEST_BADGES note): a document that reads `Empty` on the list must not read as an
                  ordinary amber wait-state the moment it is opened. */}
              {badge.glyph === null ? null : <Icon icon={badge.glyph} size="xs" />}
              {badge.label}
            </Badge>
            <Button aria-label={`Rename ${doc.name}`} intent="ghost" onClick={(): void => setRenameOpen(true)} size="icon" title="Rename">
              <Icon icon={Pencil} size="sm" />
            </Button>
          </Row>
        </Row>

        {/* `kicker`, not `heading` — CD1 (section.tsx's own doc): a read-only GROUPING gets the micro-caps
            name plus a hairline to the edge, which is what 20+ sibling features spell and what the mock
            draws. `heading` is the settings-pane form contract, and this pane is a readout (side-eye
            2026-08-19 P2). */}
        <Section kicker="Details">
          {/* ONE grid, not a stack of rows: the label track is `max-content` (as wide as the widest label,
              no wider) and every value still starts at ONE x, which a per-row measurement cannot promise.
              See `cols="readout"`'s own note for why the knob-row token stopped being right here. */}
          <Grid cols="readout" gap="row">
            <DetailRow label="Origin" value={originLabel(doc.origin)} />
            <DetailRow label="Type" value={doc.mime} />
            <DetailRow label="Size" value={formatBytes(doc.byteSize)} />
            {/* THE LABEL CARRIES THE UNIT (side-eye 2026-08-19 N-3): the values are bare numbers, grouped
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

        <Section kicker="Maintenance">
          <Stack gap="row">
            {/* THE PARAGRAPH TAKES THE READING MEASURE, THE BLOCK ABOVE KEEPS THE CONTROL ONE (#1653). #1175
                put `--width-content-col` on the Stack that holds this editor's controls and said in the same
                breath that "a block holding controls keeps the wider measure while the paragraph inside it
                takes this one" — this sentence, the longest running copy in the pane, never got the second
                half. Measured pre-fix in the CT browser with real Geist: 446.0px = 90.0 average glyph
                advances per line against the design law's 65-75 band, identical at 1280/1440/1920 because
                the only cap above it was the 720px content column. `--reading-measure-prose` resolves 329px
                HERE (47ch in this paragraph's own 10.5px gloss font — a `ch` on the wrapper would have
                resolved at the wrong scale, the #213/#1130 failure the token's contract names) = 66.4 law
                characters.
                AND `justify="start"`, NOT `between` — a cap alone would have paid for the measure with a
                390px hand-span between the sentence and the button that acts on it, which is the SAME
                defect the 08-03 measure and the 08-19 readout-grid fix were both filed for ("a measure caps
                the worst case; it does not tie the pair"). The button rides its own sentence. */}
            <Row align="center" gap="row" justify="start">
              <Text className="min-w-0 max-w-(--reading-measure-prose)" voice="gloss">
                Re-chunk and re-embed this document — after a settings change, or to heal a partial index.
              </Text>
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

        <Section kicker="Source text">
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

/**
 * One readout row: a LABEL COLUMN, then its value immediately beside it.
 *
 * It used to be `justify="between"` — label hard left, value hard right — which is the settings-row
 * grammar and is wrong for a readout: the pair spends whatever width it is given, so at the real
 * ~1450px CONTENT pane "Origin" and "Upload" sat 382-475px apart and the eye had to travel a
 * hand-span to tie a two-word label to a one-word value (side-eye 2026-08-19 P2). `max-w-prose`
 * halved that span in the 2026-08-03 sweep and is still right — a readout inside a measure is what
 * stops it spanning the window — but a measure caps the WORST case; it does not tie the pair.
 *
 * A COLUMN does: the value starts at ONE x on every row, at every pane width — a RANGE property rather than
 * a point fix, because there is no gap left to grow.
 *
 * THE COLUMN IS `max-content` NOW, NOT THE KNOB-ROW TOKEN (side-eye 2026-08-19 N-7). `w-(--width-label-col)`
 * was the first spelling of it and is a 152px CONTROL column — the width that makes sliders and number
 * fields start at one x down a settings pane. Spent on ~62px readout labels it left ~90px of nothing inside
 * every row: the same gap the fixed column was introduced to close, one size smaller. So the ruling above
 * stands (one column, values at one x) and only its measurement changes — the rows are cells of ONE
 * `cols="readout"` grid, whose label track is exactly as wide as the widest label. Which is also why this
 * returns a FRAGMENT: a wrapping Row would be one grid item, and the shared track would be gone.
 */
function DetailRow({ label, value }: { readonly label: string; readonly value: string }): ReactElement {
  return (
    <>
      <Text voice="gloss">{label}</Text>
      <Text className="min-w-0 truncate">{value}</Text>
    </>
  );
}
