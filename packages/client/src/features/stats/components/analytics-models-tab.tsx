// The Analytics CONTEXT "Models" tab — per-model economics. Reads `byModel` (the model_stats rollup:
// generations, tokens, cost, character reach) rendered as a ranked bar-list + per-model detail rows,
// and owner-scoped `latency` (on-read TTFT/gen percentiles across all models). Read-only analytics.
//
// SCOPE HONESTY (side-eye rail-analytics 2026-08-19 P1b). `model_stats` is owner+model grain — it has no
// character axis — so this tab CANNOT narrow to the leaderboard-drilled character the way the CONTEXT
// band's face implies. It therefore SAYS SO, unmissably, whenever a character is drilled, instead of
// printing library numbers as if they were that character's.
//
// The latency quartet is the one block that could scope (`latency` has a character arm) and it is ALSO
// the block CONTENT already renders for the drilled character — two different values for one metric,
// on screen at the same time. So it renders only in the UNDRILLED state; drilled, CONTENT owns it.

import { modelDisplayName } from "@orb/kit/model-name";
import { BarList } from "@orb/ui/bar-list";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { StatFigure } from "@orb/ui/stat-figure";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary, QueryErrorState, useTRPC } from "#data";
import { testId } from "#lib";
import { useSelectedAnalyticsCharacterId } from "#state";
import { byModelBarItems, formatCompact, formatMs, formatTokens, formatUsd, UNRECORDED_NOTE } from "../lib/analytics-view-model.ts";
import { LibraryScopeNotice } from "./library-scope-notice.tsx";

export function AnalyticsModelsTab(): ReactElement {
  return (
    // DELIBERATELY UNRESERVED (#1098) — a GEOMETRY refusal. The settled body's own root IS this tab's
    // scroll container (`min-h-0 flex-1 overflow-y-auto`), and `reserveKey` wraps the settled child in an
    // auto-height Stack: the scroller would resolve against an indefinite parent and strand everything
    // past the fold (#1133). Keying analytics means hoisting the scroll box ABOVE the boundary first.
    <QueryBoundary
      fallback={<Text voice="gloss">Loading model stats…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="model stats" onRetry={retry} />}
    >
      <ModelsBody />
    </QueryBoundary>
  );
}

function ModelsBody(): ReactElement {
  const trpc = useTRPC();
  const drilled = useSelectedAnalyticsCharacterId();
  const { data: models } = useSuspenseQuery(trpc.stats.byModel.queryOptions());

  return (
    <Stack className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain" gap="section" data-testid={testId("analyticsModelsTab")}>
      <LibraryScopeNotice reason="Model usage is rolled up per model, with no per-character breakdown to narrow to." />

      {drilled === null ? <OwnerLatency /> : null}

      <Section heading="Generations">
        <BarList items={byModelBarItems(models)} label="Generations by model" valueFormatter={formatCompact} />
      </Section>

      <Section heading="Breakdown">
        {models.length === 0 ? (
          <Text voice="gloss">No model usage recorded yet.</Text>
        ) : (
          /* `role="list"` needs `listitem` CHILDREN or every row is generic to AT and the list announces
             empty (side-eye ANALYTICS 2026-08-19, P2c — 50 rows, none of them a list item). The wrapper
             carries the role, never the ListRow, and posinset/setsize is the collection-rows spelling. */
          <Stack aria-label="Models" gap="row" role="list">
            {models.map((model, index) => {
              const modelName = modelDisplayName(model.model);
              return (
                <Stack aria-posinset={index + 1} aria-setsize={models.length} key={`${model.model}-${model.provider ?? "unknown"}`} role="listitem">
                  <ListRow
                    title={modelName}
                    {...(modelName === model.model ? {} : { fullTitle: model.model })}
                    subtitle={`${model.provider ?? "unknown"} · ${formatCompact(model.generations)} gens · ${model.charactersUsedWith} characters`}
                    actions={
                      <Text voice="gloss" className="whitespace-nowrap font-mono">
                        {formatTokens(model.tokensOut, model.tokensOutProvenance)} · {formatUsd(model.costUsd)}
                      </Text>
                    }
                  />
                </Stack>
              );
            })}
          </Stack>
        )}
        <Text voice="gloss">{UNRECORDED_NOTE}</Text>
      </Section>
    </Stack>
  );
}

/** The owner-wide latency quartet — rendered ONLY with nothing drilled. Drilled, CONTENT already shows
 *  this character's quartet, and the same four labels carrying DIFFERENT numbers on screen at once was
 *  the sharpest half of the misattribution finding (P1b) as well as a straight duplicate (P2b). Its own
 *  component so the query it needs neither fires nor suspends the tab in the state that must not show it. */
function OwnerLatency(): ReactElement {
  const trpc = useTRPC();
  const { data: latency } = useSuspenseQuery(trpc.stats.latency.queryOptions({ kind: "owner" }));
  return (
    <Section heading="Latency (all models)">
      <Row gap="block" className="flex-wrap">
        <StatFigure label="Avg TTFT" value={formatMs(latency.avgTtftMs)} />
        <StatFigure label="p90 TTFT" value={formatMs(latency.p90TtftMs)} />
        <StatFigure label="Avg gen" value={formatMs(latency.avgGenMs)} />
        <StatFigure label="p90 gen" value={formatMs(latency.p90GenMs)} />
      </Row>
    </Section>
  );
}
