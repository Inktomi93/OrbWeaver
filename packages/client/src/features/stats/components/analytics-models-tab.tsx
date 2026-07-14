// The Analytics CONTEXT "Models" tab — per-model economics. Reads `byModel` (the model_stats rollup:
// generations, tokens, cost, character reach) rendered as a ranked bar-list + per-model detail rows,
// and owner-scoped `latency` (on-read TTFT/gen percentiles across all models). Read-only analytics.

import { BarList } from "@orb/ui/bar-list";
import { Button } from "@orb/ui/button";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { StatFigure } from "@orb/ui/stat-figure";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary, useTRPC } from "#data";
import { testId } from "#lib";
import { byModelBarItems, formatCompact, formatMs, formatUsd } from "../lib/analytics-view-model";

export function AnalyticsModelsTab(): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text tone="muted">Loading model stats…</Text>}
      renderError={(_error, retry): ReactElement => (
        <Text tone="muted">
          Couldn't load model stats.{" "}
          <Button intent="ghost" onClick={retry}>
            Retry
          </Button>
        </Text>
      )}
    >
      <ModelsBody />
    </QueryBoundary>
  );
}

function ModelsBody(): ReactElement {
  const trpc = useTRPC();
  const { data: models } = useSuspenseQuery(trpc.stats.byModel.queryOptions());
  const { data: latency } = useSuspenseQuery(trpc.stats.latency.queryOptions({ kind: "owner" }));

  return (
    <Stack
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      gap="section"
      data-testid={testId("analyticsModelsTab")}
    >
      <Section heading="Latency (all models)">
        <Row gap="block" className="flex-wrap">
          <StatFigure label="Avg TTFT" value={formatMs(latency.avgTtftMs)} />
          <StatFigure label="p90 TTFT" value={formatMs(latency.p90TtftMs)} />
          <StatFigure label="Avg gen" value={formatMs(latency.avgGenMs)} />
          <StatFigure label="p90 gen" value={formatMs(latency.p90GenMs)} />
        </Row>
      </Section>

      <Section heading="Generations">
        <BarList
          items={byModelBarItems(models)}
          label="Generations by model"
          valueFormatter={formatCompact}
        />
      </Section>

      <Section heading="Breakdown">
        {models.length === 0 ? (
          <Text size="micro" tone="muted">
            No model usage recorded yet.
          </Text>
        ) : (
          <Stack gap="row" role="list">
            {models.map((model) => (
              <ListRow
                key={`${model.model}-${model.provider ?? "unknown"}`}
                title={model.model}
                subtitle={`${model.provider ?? "unknown"} · ${formatCompact(model.generations)} gens · ${model.charactersUsedWith} characters`}
                actions={
                  <Text size="micro" tone="muted" className="whitespace-nowrap font-mono">
                    {formatCompact(model.tokensOut)} tok · {formatUsd(model.costUsd)}
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
