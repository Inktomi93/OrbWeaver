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
// "327 characters": three numbers in one viewport, two of them unlabelled, reading as a contradiction. The
// census projection is shared with the LIST band (`lib/corpus-vocabulary.ts`) rather than re-spelled here,
// so the two bands of one section cannot drift into two answers.

import { Button } from "@orb/ui/button";
import { Icon, Library } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { distilledCensus } from "../lib/corpus-vocabulary.ts";

export function CorpusContextHeader(): ReactElement {
  const trpc = useTRPC();
  const catalog = useQuery(trpc.discovery.catalog.queryOptions());
  const distilled = catalog.data?.totalDistilled ?? 0;
  const count = distilledCensus(distilled, catalog.data?.totalCharacters ?? 0);

  // A FAILED CENSUS IS NOT A ZERO CENSUS (#1500). `catalog?.totalDistilled ?? 0` hid a failed read behind the
  // same silence as a library with nothing distilled — the band simply lost its number, which reads as "no
  // distilled cards" to the one reader who would notice. The failed arm states itself and carries the
  // re-read; it is a button rather than a line because a band has no other way to offer one, and it only ever
  // exists in the state that earns it.
  let census: ReactElement | null = null;
  if (catalog.isError) {
    census = (
      <Button intent="ghost" onClick={(): void => void catalog.refetch()} size="sm" type="button">
        Census unavailable — retry
      </Button>
    );
  } else if (distilled > 0) {
    census = (
      <Text voice="gloss" className="font-mono">
        {count}
      </Text>
    );
  }

  return (
    <Row align="center" gap="field" className="min-w-0">
      <Icon icon={Library} size="sm" />
      {/* `Whole corpus` (D271): owner-wide context must never read as a description of the selected artifact. */}
      <Text className="truncate text-title leading-title font-semibold">Whole corpus</Text>
      {census}
    </Row>
  );
}
