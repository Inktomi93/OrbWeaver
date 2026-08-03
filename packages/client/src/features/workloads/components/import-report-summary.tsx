// import-report-summary — the leaf that renders a completed import's normalized `ImportSummary`: a tally
// line (imported · skipped · failed) then a per-file list (glyph + path + detail), so a bundle restore
// shows exactly what landed, deduped, was skipped (unknown kind), or failed. Pure presentation over the
// hook's summary — no reads, no state.

import { AlertTriangle, Check, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { testId } from "#lib";
import type { ImportSummary } from "../lib/portability-model.ts";
import { summaryCaption } from "../lib/portability-model.ts";

export interface ImportReportSummaryProps {
  readonly summary: ImportSummary;
}

/** The tally caption + per-file outcome list for a finished import. */
export function ImportReportSummary({ summary }: ImportReportSummaryProps): ReactElement {
  return (
    <Stack gap="block" data-testid={testId("importReport")}>
      <Text className="font-semibold">{summaryCaption(summary)}</Text>
      {summary.outcomes.length > 0 ? (
        <Stack aria-label="Imported files" gap="field" role="list">
          {summary.outcomes.map((outcome) => (
            <Row key={outcome.path} align="center" gap="row" role="listitem">
              <Icon
                icon={outcome.ok ? Check : AlertTriangle}
                size="sm"
                className={outcome.ok ? "text-success" : "text-destructive"}
                label={outcome.ok ? "Imported" : "Not imported"}
              />
              <Text className="min-w-0 flex-1 truncate font-mono">{outcome.path}</Text>
              <Text voice="gloss" className="whitespace-nowrap">
                {outcome.detail}
              </Text>
            </Row>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}
