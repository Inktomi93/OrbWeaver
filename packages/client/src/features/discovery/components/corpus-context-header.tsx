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

import { Icon, Library } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";

export function CorpusContextHeader(): ReactElement {
  const trpc = useTRPC();
  const { data: catalog } = useQuery(trpc.discovery.catalog.queryOptions());
  const count = catalog?.totalDistilled ?? 0;

  return (
    <Row align="center" gap="field" className="min-w-0">
      <Icon icon={Library} size="sm" />
      <Text size="title" weight="semibold" className="truncate">
        Corpus
      </Text>
      {count > 0 ? (
        <Text className="font-mono" size="micro" tone="muted">
          {count}
        </Text>
      ) : null}
    </Row>
  );
}
