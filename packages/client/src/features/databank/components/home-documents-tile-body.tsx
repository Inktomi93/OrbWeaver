// The "Databank" HOME tile body (D-7: "recent documents + an ingest-health line") —
// DATABANK-owned, because the tile's data and its intent are this feature's (the home
// tile ownership rule: the tile belongs to the feature that owns the DATA and the INTENT, never to the host).
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
import { Icon, Plus } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { TrailingArrow } from "#components";
import { useTRPC } from "#data";
import { timeLib } from "#lib";
import { openModal, selectDocumentFromList, setActiveSection, setDatabankPhaseFilter } from "#state";
import { DATABANK_INGEST_GLOSS } from "../lib/databank-copy.ts";
import { bankHealth, bankHealthLine, documentSubtitle, ingestBadge, ingestPhase, ingestPollInterval, showsPhaseChip } from "../lib/databank-model.ts";

/** How many documents the tile shows. FOUR, not the library's eight: this is a half-span tile carrying a
 *  health line above the rows, and the fifth-newest document is a browse, not a glance. Exported because
 *  the contribution's first-boot `skeletonRows` is this count plus the health line (#92) — the reservation
 *  is derived from the read, never a second number that can drift from it. */
export const RECENT_DOCUMENTS_LIMIT = 4;

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
      // THE RAIL FORM, NOT THE PANE FORM (side-eye 2026-08-16 F2). `EmptyState` is the right primitive for
      // a CONTENT pane — a centred island with a glyph, a 16px title and a button, filling a space that is
      // otherwise blank. In a rail SLOT it was a register break: 442x239px of centred column, the only
      // centred thing on a page whose every other block is flush-left, 20% of the page's height for the one
      // block with nothing in it, and at 2000px a centred island beside ~350px of void. It also spent the
      // ramp's only 16px on the emptiest sentence on the surface (F8).
      //
      // The mock's own answer, and the RULED one: the block keeps its kicker band and says the same three
      // things at rail weight — a label line, the doors, and the shared gloss. ~60px, in the flow, left
      // edge shared with the four document rows it replaces. The COPY is unchanged; only the register is.
      // (The gloss ran SECOND when that ruling landed; #499 moved it last — see the note on the Row.)
      <Stack className="items-start" gap="field">
        <Text voice="label">No documents yet</Text>
        {/* THE DOORS COME BEFORE THE TEACHING LINE (#499, the residual half of side-eye rail-home P2-1).
            Measured at 1280×800 on the shipped registry: both CTAs ended 51px past the fold, and #455's
            roadmap fold could not reach them — at a narrow pane the shelf's foot subgrid is ONE track, so
            the block it folded sits BELOW this tile. What was left is this block's own reading order, and
            it was the odd one out on the shelf: `home-temp-chat-tile-body.tsx` — the peer-rank CTA one
            block up, in this same column, at this same rank — leads with its button and explains
            afterwards. This one led with three lines of explanation and put the doors under them, which
            spent the whole fold budget on the sentence and cut the two controls the state exists to offer.
            NOTHING IS THINNED and nothing below moves: the block's height is identical, the gloss is
            unchanged and still `prose`-measured, and the tile's own box (and therefore every reservation
            derived from it) is untouched. Only which end of the block the fold lands on changes.
            THE STATE LINE STAYS ON TOP: "no documents yet" is the answer to what the tile was asked, and a
            door offered before the state it answers is a control with no subject. */}
        {/* TWO AFFORDANCES, ONE STYLE (side-eye rail sweep P3-16 + the IA finding, 2026-08-17).
            [1] THE CEREMONY stays first and stays the promise the label makes (side-eye 2026-08-08 P1-2:
            it used to `setActiveSection("databank")` and land the user on the library's own empty state —
            the same sentence again, with the real button under it).
            [2] THE SECTION DOOR is new. Every other block on home can be entered; the bank could only be
            entered while it had rows in it (the trailing "All documents" action hides on an empty bank —
            2026-08-08 P2-b, which is preserved: that ruling is about a link PROMISING A LIST OF NOTHING,
            and "Open Databank" promises the section, which exists and teaches). It is the SECOND control,
            so the ceremony is still the path this block recommends.
            AND THE STYLE IS THE SHELF'S, not this tile's own: the `px-0` ghost text-link that used to sit
            here was 171×32 beside temp chat's 169×34 bordered secondary — two peer-rank CTAs, one column,
            two registers. Both are `secondary`/`sm` now (temp chat came down to `sm` in the same pass).
            The old ruling's reason — "not a second button competing with the hero across the gutter" —
            is answered by the hero itself: it is an ELEVATED, glowing island now rather than a form-tier
            box, so an `sm` secondary on the shelf is no longer in the same weight class. */}
        <Row gap="field">
          <Button intent="secondary" onClick={(): void => openModal("addDocument")} size="sm">
            <Icon icon={Plus} size="sm" />
            Add your first document
          </Button>
          <Button intent="secondary" onClick={(): void => setActiveSection("databank")} size="sm">
            Open Databank
            <TrailingArrow />
          </Button>
        </Row>
        {/* MEASURED (#1130, H5), the peer of the temp-chat gloss one block up: it resolved `max-width:
            none` and was saved from the 153ch arm only by the 1920 sub-column split, which is a layout
            accident rather than a measure. A cap makes it a property of the prose — and since #1145 that
            cap is `--reading-measure-prose`, the TEACHING measure, because the house one is 75 CSS `ch`
            and a CSS `ch` is ~1.5 of the characters the design law counts. */}
        <Text className="line-clamp-3 max-w-(--reading-measure-prose)" voice="gloss" prose={true}>
          {DATABANK_INGEST_GLOSS}
        </Text>
      </Stack>
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
                // The tap floor is `size="sm"`'s own `h-control-sm`, which is ≥ `--spacing-touch-target`
                // at BOTH pointer classes by construction (44/44 coarse, 32/28 fine — theme.css's
                // `@media (pointer: fine)` block). The `min-h-touch-target` that used to sit here could
                // therefore never bind; it read as the thing holding the floor up while the sealed height
                // already did (#169 — invisible to `ui-size-via-variant` until its value class learned
                // about hyphens). `p-0` stays: the Badge inside is the whole visible chip.
                className="p-0"
                intent="ghost"
                key={chip.phase}
                onClick={(): void => showPhase(chip.phase)}
                shape="pill"
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
                      // The Empty phase's ⚠ glyph rides here too — the third-differentiator ruling
                      // (2026-08-19) reaches all three surfaces, not two; safe since the badge inline
                      // arm learned to keep a block svg on the line.
                      subtitleLead: (
                        <Badge className="mr-field" intent={badge.intent} size="inline" tone="soft">
                          {badge.glyph === null ? null : <Icon icon={badge.glyph} size="xs" />}
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
 *  documents in it, and flashing the link out and back in would be its own defect.
 *
 *  THAT RULING SURVIVES AND IS NOW PRICED (#465, measured 2026-08-22 on the live stack at 1280x800).
 *  On the EMPTY-bank arm the assume-populated pending state is a layout shift: when `bankHealth` lands
 *  `total === 0` the band loses this button, so the whole `databank.documents` region moves 0px,-10px
 *  (the `h2` 806,738 → 806,728) and the band's flex-1 `Separator` re-lays out into the vacated span
 *  (0,0,0,0 → 875,735,373,1), for a layout-shift value of **0.00034** — reproducible on EVERY boot,
 *  including boots 2-4 with the home box memory present. It was mis-diagnosed as an appearance/type-ramp
 *  reflow landing after `settings.getUserSettings` (#465's premise); it is neither. Three appearance arms
 *  (`--appearance chatWidthPct 60|100`, `density compact + fontScale 1.25`) leave this entry BYTE-identical
 *  while the real appearance reflow appears as a separate 0.2623 shift after it, so no
 *  `appearanceSettingsSchema` key and no boot-hint coverage gap is involved here.
 *
 *  NOT FIXED, deliberately: while the census is unknown the row can either reserve this control (a shift
 *  on the empty arm, what we pay) or not (a shift on the POPULATED arm, i.e. the steady state, which the
 *  ruling above refuses). There is no third arm — a hidden placeholder still collapses on the empty arm —
 *  and the cost sits an order of magnitude under the flagger's own 0.002 reporting floor
 *  (`lib/motion-stats.ts` MIN_REPORTED_SHIFT), which is why it never appeared in a `[cls]` console line. */
export function HomeDocumentsTileAction(): ReactElement | null {
  const trpc = useTRPC();
  const { data: census } = useQuery(trpc.databank.bankHealth.queryOptions());
  if (census?.total === 0) {
    return null;
  }
  return (
    // The arrow is DECORATIVE (rail sweep P3-14) — the name is "All documents".
    <Button intent="ghost" onClick={(): void => setActiveSection("databank")} size="sm">
      All documents
      <TrailingArrow />
    </Button>
  );
}
