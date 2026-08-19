// The Analytics CONTEXT "Personas" tab — which of your personas you play as. Reads `personaUsage`
// (a live per-persona GROUP BY: chats, messages, tokens, last-used) rendered as a ranked message-count
// bar-list + per-persona detail rows. Read-only analytics.
//
// THE SCOPED TAB (side-eye rail-analytics 2026-08-19 P1b). `personaUsage` is a live canon GROUP BY, not a
// rollup read, so unlike Models and Time it CAN honour the CONTEXT band's drilled face: the drilled
// character narrows the chat set, and the tab's numbers become that character's. §4.2 CONTEXT-follows-
// CONTENT is the law here — labelling would have been the fallback for a verb that can't scope, and this
// one can. Ownership is unchanged either way (`personas.owner_id`), so the id is a projection filter.

import { BarList } from "@orb/ui/bar-list";
import { Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary, QueryErrorState, useTRPC } from "#data";
import { testId, timeLib } from "#lib";
import { useSelectedAnalyticsCharacterId } from "#state";
import { formatCompact, formatTokens, personaBarItems } from "../lib/analytics-view-model.ts";

export function AnalyticsPersonasTab(): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading persona usage…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="persona usage" onRetry={retry} />}
    >
      <PersonasBody />
    </QueryBoundary>
  );
}

function PersonasBody(): ReactElement {
  const trpc = useTRPC();
  const drilled = useSelectedAnalyticsCharacterId();
  const { data: personas } = useSuspenseQuery(trpc.stats.personaUsage.queryOptions(drilled === null ? {} : { characterId: drilled }));

  return (
    <Stack className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain" gap="section" data-testid={testId("analyticsPersonasTab")}>
      {/* The tab states which question it answered — the same duty the two unscopable tabs discharge with
          a library notice, discharged here by naming the narrower scope it actually applied. */}
      <Text voice="gloss" role="note" data-slot="analytics-scope">
        {drilled === null ? "Across every chat in your library." : "Only the chats with the character you opened."}
      </Text>

      <Section heading="Messages by persona">
        <BarList items={personaBarItems(personas)} label="Messages by persona" valueFormatter={formatCompact} />
      </Section>

      <Section heading="Breakdown">
        {personas.length === 0 ? (
          <Text voice="gloss">You haven't played as any persona yet.</Text>
        ) : (
          /* `role="list"` needs `listitem` CHILDREN or every row is generic to AT and the list announces
             empty (side-eye ANALYTICS 2026-08-19, P2c). The wrapper carries the role, never the ListRow. */
          <Stack aria-label="Personas" gap="row" role="list">
            {personas.map((persona, index) => (
              <Stack aria-posinset={index + 1} aria-setsize={personas.length} key={persona.personaId} role="listitem">
                <ListRow
                  title={persona.name}
                  subtitle={`${formatCompact(persona.chatCount)} chats · ${formatCompact(persona.messageCount)} messages${persona.lastUsedAt === null ? "" : ` · last used ${timeLib.formatRelative(persona.lastUsedAt)}`}`}
                  actions={
                    <Text voice="gloss" className="whitespace-nowrap font-mono">
                      {formatTokens(persona.tokensOut)}
                    </Text>
                  }
                />
              </Stack>
            ))}
          </Stack>
        )}
      </Section>
    </Stack>
  );
}
