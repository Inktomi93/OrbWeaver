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
// ONE READ, ONE TRUTH: `databank.list({})` is the identical query key the library pane uses, so the tile
// costs nothing extra when both are alive, it inherits every producer/CRUD invalidation the library
// mutations already declare, and the two can never disagree about a document's phase. That read is the
// server's first page (newest-activity first, `desc(updatedAt)`, default limit 100) — so "recent" is the
// server's own order, and the health line summarizes that page rather than claiming a bank-wide census the
// client never fetched.
//
// FRESHNESS: the same bounded poll the library pane runs (D-3 arm b), through the model's shared
// `ingestPollInterval` — a tile that renders "2 indexing" and then never moves is the "is it stuck?" hole
// one screen further out. A bank at rest polls not at all.
//
// It suspends; home mounts every tile body inside its own `QueryBoundary`.

import type { DocumentId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { FileText, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { timeLib } from "#lib";
import { selectDocumentFromList, setActiveSection } from "#state";
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

export function HomeDocumentsTileBody(): ReactElement {
  const trpc = useTRPC();
  // `dataUpdatedAt` — "when these rows were true" — is the clock the stall overlay reads, exactly as the
  // library pane reads it: it ADVANCES with every poll tick, so a document that wedges while home is open
  // flips to `Stalled` here on the tick that crosses the threshold.
  const { data: documents, dataUpdatedAt: nowMs } = useSuspenseQuery({
    ...trpc.databank.list.queryOptions({}),
    refetchInterval: (listQuery): number | false => ingestPollInterval(listQuery.state.data, timeLib.now()),
  });

  if (documents.length === 0) {
    return (
      <EmptyState
        action={
          <Button intent="secondary" onClick={(): void => setActiveSection("databank")} size="sm">
            <Icon icon={FileText} size="sm" />
            Add your first document
          </Button>
        }
        description="Upload a file, paste text or pull in a page — indexed once, its passages feed your chats as they happen."
        icon={<Icon icon={FileText} size="lg" />}
        title="No documents yet"
      />
    );
  }

  const health = bankHealth(documents, nowMs);
  const recents = documents.slice(0, RECENT_DOCUMENTS_LIMIT);

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
          <Row align="center" className="flex-wrap" gap="field" justify="end">
            {health.attention.map((chip) => (
              <Badge intent={chip.intent} key={chip.label} size="sm" tone="soft">
                {chip.label}
              </Badge>
            ))}
          </Row>
        )}
      </Row>
      {/* `role="list"` needs `listitem` CHILDREN or the rows are generic to AT and the list announces empty
          — ListRow's root is a plain div, so the role rides a layout-primitive wrapper (the home recents /
          quick-picks precedent; a literal <li> would be invalid HTML under a div[role=list]). */}
      <Stack aria-label="Recent documents" gap="row" role="list">
        {recents.map((doc) => {
          const phase = ingestPhase(doc, nowMs);
          const badge = ingestBadge(phase);
          return (
            <Row key={doc.id} role="listitem">
              <ListRow
                clickable={true}
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
