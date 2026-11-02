// The Corpus CONTEXT-panel band identity (north-star §4 N4 / P4, §6.3) — fed by the `defineContextTabs`
// `header` slot (`corpus-section.tsx`), rendered in the context `.shell-panel-header` band so the panel
// reads as a titled analytics surface (and picks up the zone-scoped ember top edge) rather than the
// neutral "Details" fallback.
//
// DEVIATION from the chats-lane P4 template (flagged in the lane report): Corpus's five context tabs are
// OWNER-WIDE analytics (Archetypes / Map / Similarity / Compare / Visuals) — they analyse the whole
// library and never rescope to the character selected in CONTENT. Binding this header to the dossier
// subject would misrepresent the tabs as being about that one character. So the band names the SECTION's
// true subject — the corpus itself, with its distilled-card count — the honest identity for a library-wide
// analytics panel. The count shares the `discovery.catalog` cache (plain useQuery — never suspends the band).
//
// AND IT NAMES ITS BASE (issue #535, the one-pass denominator rule). This band printed a bare `Corpus 313`
// — the DISTILLED total — one pane away from the LIST band printing the same bare 313 and an h1 reading
// "320 characters": three numbers in one viewport, two of them unlabelled, reading as a contradiction. The
// census projection is shared with the LIST band (`lib/corpus-vocabulary.ts`) rather than re-spelled here,
// so the two bands of one section cannot drift into two answers.

import { Button } from "@orb/ui/button";
import { Icon, Library } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { useSuspenseQuery, useTRPC } from "#data";
import { CORPUS_WHOLE_LABEL } from "#lib";
import { useSelectedCorpusDestination } from "#state";
import { distilledCensus } from "../lib/corpus-vocabulary.ts";

export function CorpusContextHeader(): ReactElement {
  const subject = useSelectedCorpusDestination();
  return (
    <Row align="center" gap="field" className="min-inline-0">
      <Icon icon={Library} size="sm" />
      {/* D271: owner-wide context must never read as a description of the selected artifact. */}
      <Text className="truncate" voice="promoted">
        {subject === null ? CORPUS_WHOLE_LABEL : "Selected artifact"}
      </Text>
      {/* The count is the only part that reads: it sits in its own boundary, so the band itself never suspends. */}
      {subject === null ? (
        // A FAILED CENSUS IS NOT A ZERO CENSUS: the failed arm states itself and carries the re-read. It is a
        // button rather than the shared block because a band has no room for one, and nothing shows while it pends.
        <QueryBoundary
          resetKeys={[]}
          fallback={null}
          renderError={(_error, retry): ReactElement => (
            <Button variant="ghost" onClick={retry} size="sm" type="button">
              Census unavailable — retry
            </Button>
          )}
        >
          <Census />
        </QueryBoundary>
      ) : null}
    </Row>
  );
}

function Census(): ReactElement | null {
  const trpc = useTRPC();
  const { data: catalog } = useSuspenseQuery(trpc.discovery.catalog.queryOptions());
  if (catalog.totalDistilled === 0) {
    return null;
  }
  return <Text voice="datumMono">{distilledCensus(catalog.totalDistilled, catalog.totalCharacters)}</Text>;
}
