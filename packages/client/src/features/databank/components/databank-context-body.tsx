// The Databank CONTEXT arm — "where this document fires" for the open document (the
// activation panel). Three blocks:
//
//   EVERYWHERE  — the ONE write this panel owns. Global attach is OWNER authority, so it lives on the
//                 document; per-chat attach is HOST authority and lives in the chat panel. The write lives
//                 where the authority lives (§2.1's carried rule — legacy's own file header states it).
//   ACTIVE IN   — the named list off `listAttachments`, each row a door (`databank-active-in.tsx`). It
//                 shipped as two integer COUNTS while the wire carried ids and no names; the scope
//                 constraint that forced that (D18 — a `chat_documents` row outlives its attacher's seat)
//                 is unchanged and is now enforced ON THE WIRE by the injected `resolveVisibleRooms`, so
//                 what arrives here is already only the rooms this reader may open. That component's
//                 header carries the fork in full.
//   RETRIEVAL   — a POINTER, never a duplicate. How many passages get pulled and how close a match must be
//                 is the landed retrieval-knobs settings section, and this spec does not touch it; saying so
//                 here is what stops the library growing a second copy of those knobs.
//
// `kind:"single"` context ⇒ the NO-SELECTION arm is the section definition's `context.empty`, never this
// file: the shell only mounts a body when something is selected. What remains here is the GONE arm — the
// document was deleted (on this device or another) while its context was open.
//
// THE GONE ARM READS `databank.get`, NOT THE LIST. It used to look the open document up in
// `databank.list`'s rows and call a miss "deleted" — a reading that held only while that list was the WHOLE
// bank. The library pane pages now, so a document opened from page three is simply not in the first page,
// and the list-miss test would have reported every one of them as deleted. `get` is the per-document read
// the CONTENT pane already makes for the same document (same cache entry, no extra fetch), and its
// NOT_FOUND is the real deletion signal — surfaced as this pane's own designed empty rather than the
// boundary's generic failure, because "someone deleted this" is a state, not an error.

import type { DocumentId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { FileText, Icon, SlidersHorizontal } from "@orb/ui/icons";
import { Row, Section, Stack, Surface } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, useInvalidation, useTRPC } from "#data";
import { openConfigTo, useSelectedDocumentId } from "#state";
import { useAttachDocumentGlobal, useDetachDocumentGlobal } from "../hooks/use-databank-mutations.ts";
import { DATABANK_CONTEXT_EMPTY } from "../lib/databank-copy.ts";
import { ActiveInSection } from "./databank-active-in.tsx";

export function DatabankContextBody(): ReactElement {
  const documentId = useSelectedDocumentId();
  // The shell mounts a `single` body UNCONDITIONALLY and hands it no result — only the body can read its own
  // selection — so the no-selection arm is rendered HERE, from the same copy the definition declares.
  if (documentId === null) {
    // NO HERO GLYPH ON THIS ARM (side-eye 2026-08-19 N-4). On a first run all three panes are empty at once
    // and all three printed the SAME `FileText` at `lg` — one screen, one glyph, three times, which reads as
    // a template rather than three answers. Of the three this is the one to drop: the LIST's glyph names the
    // thing you do not have yet (and sits over the Add that fixes it) and CONTENT's is the section's own
    // welcome, while a 320px CONTEXT rail's no-selection arm is a CAPTION for a panel, not a hero — its
    // title and sentence carry it. The other two keep theirs; the repetition is what goes.
    // @orb-waive empty-state-has-action(EmptyState): the NO-SELECTION arm: a `single` context body is mounted unconditionally and must render the section's own context.empty copy itself, while the next step — picking a row — lives in the sibling LIST pane, which is on screen whenever this is (the config-context-body precedent). Ends if the context body stops mounting without a member.
    return <EmptyState description={DATABANK_CONTEXT_EMPTY.description} title={DATABANK_CONTEXT_EMPTY.title} />;
  }
  return (
    // The shell wraps a `tabs` context in a boundary but NOT a `single` body (section-context-host), so this
    // panel owns the one its suspending reads need.
    // DELIBERATELY UNRESERVED (#1098) — and the reason is a HAZARD, not a preference. `MeasuredSettle`'s
    // effect carries NO dependency array (`components/query-boundary.tsx`), so it re-measures the wrapper on
    // EVERY commit; a commit in which the child is a one-line pending arm is remembered exactly like a
    // settled one, and the rail thereafter reserves a box that lies about its own content.
    //
    // #1726 ATTEMPTED THE KEYING AND REFUSED IT, so the next sweep does not pay for the same wall twice.
    // Hoisting is not enough here, because this rail has TWO in-component readers, not one, and each is
    // in-component by a RULING rather than by accident:
    //   · `ContextBody`'s own `databank.get` — the GONE arm. Suspending it would report a deleted document
    //     as a throw and force this panel to hand-roll a `renderError` (G29 RED). It IS hoistable above the
    //     boundary, and #1726 did hoist it — that half worked.
    //   · `databank-active-in.tsx`'s `listAttachments` — the "Checking…" arm. It is non-suspending because
    //     a failed junction read must say so rather than claim the document feeds NOWHERE (#1500), and
    //     because a slow junction read must not blank the Everywhere toggle above it. Hoisting THAT one
    //     above the boundary would replace the whole rail with a loading line on every document switch —
    //     strictly worse than the block-local wait it exists to give.
    // With Active-in staying put, a settled COMMIT of this rail is not a settled RAIL, so there is no
    // instant at which the measurement would be honest. And the boundary's only remaining suspending read
    // is `EverywhereSection`'s `listGlobal`, which is not keyed by document and therefore never re-suspends
    // on a switch — so a key here would buy nothing even if it were safe. Reversing this needs Active-in's
    // #1500 ruling revisited first, which is not a reservation's call to make.
    <QueryBoundary
      fallback={<Text voice="gloss">Loading…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="this document's attachments" onRetry={retry} />}
    >
      <ContextBody documentId={documentId} />
    </QueryBoundary>
  );
}

/** The CONTEXT BAND's identity (`ContextDefinition.header`, the §6b P4 slot) — `library.html`'s "Document",
 *  unconditionally, because the band names what this PANE is about rather than what happens to be open.
 *
 *  Without it the band fell back to the shell's neutral "Details", which named nothing over three blocks
 *  that answer where a document FEEDS, and collided with the CONTENT pane's own "Details" group heading
 *  ~950px to its left — the generic-band finding the config workspace was swept for first (side-eye
 *  2026-08-03 P3). It never doubles the body: the no-selection arm says "Where a document fires" and the
 *  open arm's blocks are "Everywhere / Active in / Retrieval". */
export function DatabankContextHeader(): ReactElement {
  return (
    // `kicker` — a BAND's name, painted like the LIST band on the same horizon (`ListPaneHeader`'s
    // micro-caps), not like a datum's label. Same measured mismatch the config workspace was swept for.
    <Text as="span" voice="kicker">
      Document
    </Text>
  );
}

/** The document is GONE — deleted here or on another device while its context was open. A designed state,
 *  not a failure: there is nothing to retry, and the next step is picking another row. */
function DocumentGone(): ReactElement {
  // "from the list", never "on the left" (side-eye 2026-08-19 N-10): the LIST pane is a docked column, a
  // slide-over or collapsed, and on a phone the panes stack — the direction is wrong more often than right.
  return (
    // @orb-waive empty-state-has-action(EmptyState): the GONE arm — the open document was deleted while its activation panel was up. The next step is picking another row in the sibling roster, which is on screen; the world-info/tag/regex context twins are the same species. Ends if the context pane can be shown without its sibling roster.
    <EmptyState description="This document was deleted. Pick another from the list." icon={<Icon icon={FileText} size="lg" />} title="Document not found" />
  );
}

/** Is this the server saying the document no longer exists? Keyed on the STRUCTURED tRPC code, never message
 *  text (the `use-databank-mutations` / `invite-dialog` precedent) — `DocumentNotFoundError` is mapped to
 *  NOT_FOUND by the transport's global error mapping. */
function isDocumentGone(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("data" in error)) {
    return false;
  }
  return (error as { data?: { code?: string } }).data?.code === "NOT_FOUND";
}

/** The open document's own row. NON-suspending, deliberately: a deleted document is a designed STATE with
 *  its own copy, and a suspending read can only report it as a thrown error to the boundary — which would
 *  make this panel hand-roll a `renderError` arm (G29 RED, and rightly: the boundary's error surface is one
 *  sealed component). The three arms are decided HERE instead. The `listGlobal`/`listAttachments` reads
 *  below still suspend, so the boundary keeps its job for everything that IS a failure. */
function ContextBody({ documentId }: { readonly documentId: DocumentId }): ReactElement {
  const trpc = useTRPC();
  const { data: doc, error, isPending, refetch } = useQuery(trpc.databank.get.queryOptions({ id: documentId }));

  if (isPending) {
    // The SAME line the boundary's fallback shows, so the panel reads identically whichever read is settling.
    return <Text voice="gloss">Loading…</Text>;
  }
  if (error !== null) {
    return isDocumentGone(error) ? <DocumentGone /> : <QueryErrorState label="this document" onRetry={(): void => void refetch()} />;
  }

  return (
    // `instrument` with a form island (density §3 blesses exactly this nesting for a context panel).
    <Surface tier="instrument">
      <Stack gap="section" padding="block">
        <EverywhereSection documentId={doc.id} name={doc.name} />
        <ActiveInSection documentId={doc.id} />
        {/* `kicker`, not `heading` — CD1 (section.tsx's own doc): these three are read-only groupings in a
            320px context rail, which is the shape the micro-caps + hairline exists for. */}
        <Section kicker="Retrieval">
          <Stack gap="row">
            <Text voice="gloss">How many passages get pulled, and how close a match must be, is tuned once for the whole bank.</Text>
            {/* A DOOR, NOT A BREADCRUMB (side-eye 2026-08-19 P2). It used to spell the path in prose —
                "Settings → Chat behavior → Databank" — beside an `openConfigTo` seam that lands on that
                exact subcategory. A path a user has to retrace by hand is a control we declined to render. */}
            <Button
              className="self-start"
              intent="ghost"
              // The category + subcategory as LITERALS, the house spelling for a settings deep link
              // (`openConfigTo("workloads", "jobs")`, `openConfigTo("chat-behavior", "memory")`).
              // The `DATABANK_SETTINGS_SUBCATEGORY` const that carries the same id lives in `features/chat`
              // (chat owns the {{databank}} slot's settings section), and a feature never sideways-imports
              // another feature's lib.
              onClick={(): void => openConfigTo("chat-behavior", "databank")}
              size="sm"
              type="button"
            >
              <Icon icon={SlidersHorizontal} size="sm" />
              Retrieval settings
            </Button>
          </Stack>
        </Section>
      </Stack>
    </Surface>
  );
}

function EverywhereSection({ documentId, name }: { readonly documentId: DocumentId; readonly name: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: globalIds } = useSuspenseQuery(trpc.databank.listGlobal.queryOptions());
  const attach = useAttachDocumentGlobal({ trpc, invalidation });
  const detach = useDetachDocumentGlobal({ trpc, invalidation });

  const isGlobal = globalIds.includes(documentId);
  const isPending = attach.isPending || detach.isPending;

  return (
    <Section kicker="Everywhere">
      <Row align="center" gap="row" justify="between">
        <Text voice="gloss">Feed this document to every chat, on top of any per-chat or per-character attachments.</Text>
        {isPending ? (
          <Text role="status" voice="gloss">
            {isGlobal ? `Stopping ${name} everywhere…` : `Feeding ${name} everywhere…`}
          </Text>
        ) : null}
        <Switch
          aria-label={isGlobal ? `Stop feeding ${name} to every chat` : `Feed ${name} to every chat`}
          checked={isGlobal}
          disabled={isPending}
          onCheckedChange={(on): void => {
            if (on) {
              attach.mutate({ documentId });
            } else {
              detach.mutate({ documentId });
            }
          }}
        />
      </Row>
    </Section>
  );
}
