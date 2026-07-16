// The Analytics CONTEXT "Personas" tab — which of your personas you play as. Reads `personaUsage`
// (a live per-persona GROUP BY: chats, messages, tokens, last-used) rendered as a ranked message-count
// bar-list + per-persona detail rows. Read-only analytics.

import { BarList } from "@orb/ui/bar-list";
import { Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary, QueryErrorState, useTRPC } from "#data";
import { testId, timeLib } from "#lib";
import { formatCompact, personaBarItems } from "../lib/analytics-view-model";

export function AnalyticsPersonasTab(): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text tone="muted">Loading persona usage…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="persona usage" onRetry={retry} />}
    >
      <PersonasBody />
    </QueryBoundary>
  );
}

function PersonasBody(): ReactElement {
  const trpc = useTRPC();
  const { data: personas } = useSuspenseQuery(trpc.stats.personaUsage.queryOptions());

  return (
    <Stack className="min-h-0 flex-1 overflow-y-auto overscroll-contain" gap="section" data-testid={testId("analyticsPersonasTab")}>
      <Section heading="Messages by persona">
        <BarList items={personaBarItems(personas)} label="Messages by persona" valueFormatter={formatCompact} />
      </Section>

      <Section heading="Breakdown">
        {personas.length === 0 ? (
          <Text size="micro" tone="muted">
            You haven't played as any persona yet.
          </Text>
        ) : (
          <Stack gap="row" role="list">
            {personas.map((persona) => (
              <ListRow
                key={persona.personaId}
                title={persona.name}
                subtitle={`${formatCompact(persona.chatCount)} chats · ${formatCompact(persona.messageCount)} messages${persona.lastUsedAt === null ? "" : ` · last used ${timeLib.formatRelative(persona.lastUsedAt)}`}`}
                actions={
                  <Text size="micro" tone="muted" className="whitespace-nowrap font-mono">
                    {formatCompact(persona.tokensOut)} tok
                  </Text>
                }
              />
            ))}
          </Stack>
        )}
      </Section>
    </Stack>
  );
}
