// import-report-summary — the leaf that renders a completed import's normalized `ImportSummary`: a tally
// line (imported · skipped · failed) then a per-file list (glyph + path + detail), so a bundle restore
// shows exactly what landed, deduped, was skipped (unknown kind), or failed. Pure presentation over the
// hook's summary — no reads, no state.
//
// NOTES (#1598/#1709) — the planes an import deliberately did NOT assert (today's one member: a re-upload
// whose embedded lorebook was KEPT because the character already holds a primary book the owner may have
// edited). Two homes, because the two import arms carry them at different granularities: the BUNDLE arm's
// `summary.notes` is already flattened batch-wide (#1710 — no per-file list exists to hang them off); the
// CARD arm's are per-file and ride `outcome.notes` beside the per-file detail it already renders. Neither
// is a toast — an import that silently kept the wrong plane is exactly the "book kept" surprise this
// pairs with (#1598's whole reason for existing).

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
      {summary.notes.length === 0 ? null : (
        <Stack aria-label="Import notes" gap="field" role="list">
          {summary.notes.map((note) => (
            <Text key={note} voice="gloss" role="listitem">
              {note}
            </Text>
          ))}
        </Stack>
      )}
      {summary.outcomes.length > 0 ? (
        <Stack aria-label="Imported files" gap="field" role="list">
          {summary.outcomes.map((outcome) => (
            <Stack key={outcome.path} gap="field">
              <Row align="center" gap="row" role="listitem">
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
              {(outcome.notes ?? []).map((note) => (
                <Text key={note} voice="gloss" className="pl-row">
                  {note}
                </Text>
              ))}
            </Stack>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}
