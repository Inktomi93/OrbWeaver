// The "Databank" HOME tile body (databank-surface-spec D-7: "recent documents + an ingest-health line") —
// DATABANK-owned, because the tile's data and its intent are this feature's (the home-section-spec §3.3
// ownership rule: the tile belongs to the feature that owns the DATA and the INTENT, never to the host).
//
// WHY A TILE AT ALL, when the rail already carries a Databank glyph and home's jump grid already links it:
// a jump row says the section EXISTS. This says whether the bank is doing its job — how many passages a
// chat can actually pull from right now, and whether anything is wedged. An ingest that never finished is
// invisible from everywhere except the library pane, and the whole point of D-7 is that you should not have
// to go looking. The health line is therefore the tile's FIRST line, above the documents.
//
// TWO READS, EACH ANSWERING ITS OWN QUESTION (2026-08-14). The ROWS are `databank.list`'s first page — a
// four-row "recent" glance in the server's own order (`desc(updatedAt), desc(id)`). The HEALTH LINE and its
// chips are `databank.bankHealth`, a real census.
//
// It used to be one read doing both, and that was the defect: the line summarized the loaded page while
// reading as a statement about the bank ("100+ documents", "12 stalled" — meaning "among your newest 100").
// A chip is a CONTROL that scopes the library to a phase, so an aggregate counted over a window would send
// the user to a pane that disagrees with it. The census counts through the same predicates the library
// filters by, so the chip and its destination agree by construction.
//
// The rows read shares the band header's `databank.list` cache entry and inherits every producer/CRUD
// invalidation the library mutations already declare (they invalidate the whole `databank.list` path); the
// census is its own key (`databank.bankHealth`) and rides the same path-level invalidation.
//
// FRESHNESS: the same bounded poll the library pane runs (D-3 arm b), through the model's shared
// `ingestPollInterval` — a tile that renders "2 indexing" and then never moves is the "is it stuck?" hole
// one screen further out. A bank at rest polls not at all.
//
// It suspends; home mounts every tile body inside its own `QueryBoundary`.

import type { IngestPhase } from "@orb/contracts/databank";
import type { DocumentId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { FileText, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { timeLib } from "#lib";
import { openModal, selectDocumentFromList, setActiveSection, setDatabankPhaseFilter } from "#state";
import { DATABANK_INGEST_GLOSS } from "../lib/databank-copy.ts";
import { bankHealth, bankHealthLine, documentSubtitle, ingestBadge, ingestPhase, ingestPollInterval, showsPhaseChip } from "../lib/databank-model.ts";

/** How many documents the tile shows. FOUR, not the library's eight: this is a half-span tile carrying a
 *  health line above the rows, and the fifth-newest document is a browse, not a glance. */
const RECENT_DOCUMENTS_LIMIT = 4;

/** Opening a document from home is a CROSS-SECTION navigation: write databank's own selection, then move
 *  the rail (the `#state` module actions — the sanctioned channel; home never wires this). */
function openDocument(documentId: DocumentId): void {
  selectDocumentFromList(documentId);
  setActiveSection("databank");
}

/** An aggregate chip's whole job: scope the library to the phase it names, then GO there. Without the
 *  second half the user is left on home having "filtered" something they cannot see. */
function showPhase(phase: IngestPhase): void {
  setDatabankPhaseFilter(phase);
  setActiveSection("databank");
}

export function HomeDocumentsTileBody(): ReactElement {
  const trpc = useTRPC();
  // `dataUpdatedAt` — "when these rows were true" — is the clock the stall overlay reads, exactly as the
  // library pane reads it: it ADVANCES with every poll tick, so a document that wedges while home is open
  // flips to `Stalled` here on the tick that crosses the threshold.
  const { data: page, dataUpdatedAt: nowMs } = useSuspenseQuery({
    ...trpc.databank.list.queryOptions({ limit: RECENT_DOCUMENTS_LIMIT }),
    refetchInterval: (listQuery): number | false => ingestPollInterval(listQuery.state.data?.items, timeLib.now()),
  });
  // The census. Suspends alongside the rows (home mounts the whole body in one QueryBoundary) and rides the
  // SAME bounded poll: a tile that renders "2 indexing" and then never moves is the "is it stuck?" hole one
  // screen further out, and the count is exactly what has to move when the ingest finishes. The poll is NOT
  // redundant with the databank bus event and must not be retired as such — the event fans at the ingest
  // TERMINAL, and nothing emits per chunk (deliberately). Poll = in-flight progress; bus = settlement.
  const { data: census } = useSuspenseQuery({
    ...trpc.databank.bankHealth.queryOptions(),
    refetchInterval: (): number | false => ingestPollInterval(page.items, timeLib.now()),
  });
  const documents = page.items;

  if (documents.length === 0) {
    return (
      <EmptyState
        action={
          // IT OPENS THE CEREMONY, NOT A SECTION (side-eye 2026-08-08 P1-2). This button used to
          // `setActiveSection("databank")`, which landed the user on the library's own empty state — the
          // same sentence again, with the real button under it. The dialog is a shell modal slot now, so
          // the promise the label makes is the thing that happens.
          <Button intent="secondary" onClick={(): void => openModal("addDocument")} size="sm">
            <Icon icon={FileText} size="sm" />
            Add your first document
          </Button>
        }
        description={DATABANK_INGEST_GLOSS}
        icon={<Icon icon={FileText} size="lg" />}
        title="No documents yet"
      />
    );
  }

  // The rows ARE the visible set (the read asks for exactly `RECENT_DOCUMENTS_LIMIT`), which is what the
  // chip decision subtracts: a phase already named by a rendered row earns no aggregate above it.
  const health = bankHealth(census, documents, nowMs);

  return (
    <Stack gap="row">
      {/* The health line. It WRAPS rather than truncating: the chips are the part that matters (a
          `3 stalled` pushed off the end of a nowrap row is the one thing this tile exists to say), and a
          half-span tile at the one-column breakpoint has no width to spare. */}
      <Row align="center" className="flex-wrap" gap="field" justify="between">
        <Text voice="datum">{bankHealthLine(health)}</Text>
        {health.attention.length === 0 ? null : (
          // The chip GROUP wraps too. Measured at the 390px host: a wrapping outer row is not enough,
          // because a non-wrapping group is ONE unbreakable flex item — four chips after a bad reindex ran
          // 12px past the card's edge with the outer row wrapping perfectly. Both levels wrap, or the
          // widest state this line exists to report is the one that falls off it.
          //
          // A NAMED GROUP (side-eye 2026-08-08 P3): the chips are a set with a subject, and a bare run of
          // three pills announces as three unrelated words between the datum line and the list.
          <Row align="center" aria-label="Ingest attention" className="flex-wrap" gap="field" justify="end" role="group">
            {health.attention.map((chip) => (
              // EVERY AGGREGATE IS A CONTROL (side-eye 2026-08-08 P2-a). The chip names documents you
              // cannot see from here; clicking it scopes the Databank list to exactly that phase and takes
              // you there, so "12 stalled" is a door instead of a notice. The accessible name says what
              // will happen — the chip's own text is a count, which is a fine LABEL and a terrible verb.
              <Button
                aria-label={`Show the ${chip.label} documents in your databank`}
                // `min-h-touch-target` is the POINTER-CONDITIONAL token (44px coarse / 28px fine), not a
                // media variant a feature may not spell: the chip's own box is ~24px, which is a fine
                // target for a mouse and an unhittable one for a thumb.
                className="min-h-touch-target rounded-full p-0"
                intent="ghost"
                key={chip.phase}
                onClick={(): void => showPhase(chip.phase)}
                size="sm"
                type="button"
              >
                <Badge intent={chip.intent} size="sm" tone="soft">
                  {chip.label}
                </Badge>
              </Button>
            ))}
          </Row>
        )}
      </Row>
      {/* `role="list"` needs `listitem` CHILDREN or the rows are generic to AT and the list announces empty
          — ListRow's root is a plain div, so the role rides a layout-primitive wrapper (the home recents /
          quick-picks precedent; a literal <li> would be invalid HTML under a div[role=list]). */}
      <Stack aria-label="Recent documents" gap="row" role="list">
        {documents.map((doc) => {
          const phase = ingestPhase(doc, nowMs);
          const badge = ingestBadge(phase);
          return (
            <Row key={doc.id} role="listitem">
              <ListRow
                clickable={true}
                // THE "RECENT" CUE, VISIBLE (side-eye 2026-08-08 P3): the list's accessible name says
                // "Recent documents" and sighted users were told nothing — four rows in an order they had
                // to infer. The stamp is the same one chat's recents tile shows ("9d"), off the same
                // `updatedAt` the server sorted by, so the order and the label agree.
                meta={timeLib.formatRelativeCompact(doc.updatedAt)}
                onClick={(): void => openDocument(doc.id)}
                subtitle={documentSubtitle(doc)}
                title={doc.name}
                {...(showsPhaseChip(phase)
                  ? {
                      // The row's own phase, at the head of the subtitle line and `size="inline"` — the
                      // library row's ruling, carried: a padded chip beside the TITLE eats the name on
                      // exactly the rows that have one, and a chip on a READY row is chrome.
                      subtitleLead: (
                        <Badge className="mr-field" intent={badge.intent} size="inline" tone="soft">
                          {badge.label}
                        </Badge>
                      ),
                    }
                  : {})}
              />
            </Row>
          );
        })}
      </Stack>
    </Stack>
  );
}

/** The tile's ONE trailing affordance, which DISAPPEARS on an empty bank (side-eye 2026-08-08 P2-b): a
 *  header link promising "All documents →" beside a body saying "No documents yet" is two controls with one
 *  destination, one of which promises a list of nothing. It asks the CENSUS whether the bank is empty — the
 *  same cache entry the band header and the tile's own health line read, non-suspensefully (no new key, no
 *  second fetch, no boundary of its own — home renders the action in the tile FRAME, outside the body's
 *  QueryBoundary) — and stays visible while that read is in flight: the steady state is a bank with
 *  documents in it, and flashing the link out and back in would be its own defect. */
export function HomeDocumentsTileAction(): ReactElement | null {
  const trpc = useTRPC();
  const { data: census } = useQuery(trpc.databank.bankHealth.queryOptions());
  if (census?.total === 0) {
    return null;
  }
  return (
    <Button intent="ghost" onClick={(): void => setActiveSection("databank")} size="sm">
      All documents →
    </Button>
  );
}
