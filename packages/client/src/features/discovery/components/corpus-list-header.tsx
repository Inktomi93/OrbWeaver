// The corpus-LIST chrome-band header (north-star §4 N1/N2, §6.3) — the content the `.shell-panel-header`
// band wraps for the Corpus LIST panel: the "CORPUS" micro-caps section title + a live distilled-card
// count. Flows into the band through the section definition's `listHeader` slot (`corpus-section.tsx`),
// the same definition-owned seam the chats lane rides — the domain-agnostic shell never names a feature.
//
// Per §2 action-ownership, Corpus is BROWSE-shaped: it has no create verb, so the band carries title +
// count only (P2's "≤1 ember button" is trivially met — zero buttons). The count is a non-suspending
// `useQuery` on the shared `discovery.catalog` cache (the browse view below suspends on it already, so no
// extra fetch): the title renders immediately and stays put while the count settles.

import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";

export function CorpusListHeader(): ReactElement {
  const trpc = useTRPC();
  const { data: catalog } = useQuery(trpc.discovery.catalog.queryOptions());
  const count = catalog?.totalDistilled ?? 0;

  return (
    <Row align="center" gap="field">
      <Text size="micro" tone="muted" transform="caps" weight="semibold">
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
