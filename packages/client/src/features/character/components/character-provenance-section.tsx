// The §6.4 read-only tail of the Advanced tab — NONE of this is a form field (display only):
//   • Provenance (import): `importedFrom` + `importHash` render as muted rows ONLY when non-null (an
//     app-authored card shows neither). The editable `creator`/`cardVersion` live in the tab's FORM section.
//   • Unrecognized data: `extensions` + `residualData` — a collapsed read-only JSON viewer (hygiene-only
//     round-trip fields the editor never authors).
//   • Refinery: `{score, analysis}` — DERIVED, never authored → a `stat-figure` readout (§6.4: "a
//     meter/stat-figure readout, NOT a form field"). `null`/no-score degrades to a muted "not analyzed".

import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Row, Section, Stack } from "@orb/ui/layout";
import { StatFigure } from "@orb/ui/stat-figure";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

/** The derived refinery signals (a numeric quality score + an opaque analysis blob), or null. */
export interface CharacterRefinery {
  readonly score: number | null;
  readonly analysis: Record<string, unknown> | null;
}

export interface CharacterProvenanceSectionProps {
  readonly importedFrom: string | null;
  readonly importHash: string | null;
  readonly extensions: Record<string, unknown> | null;
  readonly residualData: Record<string, unknown> | null;
  readonly refinery: CharacterRefinery | null;
}

const SCORE_DECIMALS = 2;

export function CharacterProvenanceSection({
  importedFrom,
  importHash,
  extensions,
  residualData,
  refinery,
}: CharacterProvenanceSectionProps): ReactElement {
  return (
    <Stack gap="section">
      <Section heading="Card quality">
        {refinery === null || refinery.score === null ? (
          <Text tone="muted">Not analyzed yet.</Text>
        ) : (
          <StatFigure label="Refinery score" value={refinery.score.toFixed(SCORE_DECIMALS)} />
        )}
      </Section>

      {importedFrom === null && importHash === null ? null : (
        <Section heading="Provenance">
          {importedFrom === null ? null : (
            <ProvenanceRow label="Imported from" value={importedFrom} />
          )}
          {importHash === null ? null : <ProvenanceRow label="Import hash" value={importHash} />}
        </Section>
      )}

      {extensions === null && residualData === null ? null : (
        <Section heading="Unrecognized data">
          <JsonViewer label="Extensions" value={extensions} />
          <JsonViewer label="Residual data" value={residualData} />
        </Section>
      )}
    </Stack>
  );
}

/** A muted read-only provenance row (label + mono value). */
function ProvenanceRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <Row gap="row" align="center" className="flex-wrap">
      <Text size="micro" tone="muted" transform="caps">
        {label}
      </Text>
      <Text size="code" tone="muted" className="break-all font-mono">
        {value}
      </Text>
    </Row>
  );
}

/** A collapsed read-only JSON dump of a hygiene-only round-trip blob (rendered only when non-empty). */
function JsonViewer({
  label,
  value,
}: {
  readonly label: string;
  readonly value: Record<string, unknown> | null;
}): ReactElement | null {
  if (value === null || Object.keys(value).length === 0) {
    return null;
  }
  return (
    <Collapsible>
      <CollapsibleTrigger>{label}</CollapsibleTrigger>
      <CollapsiblePanel>
        <Text
          as="div"
          size="code"
          tone="muted"
          className="overflow-auto whitespace-pre-wrap font-mono"
        >
          {JSON.stringify(value, null, 2)}
        </Text>
      </CollapsiblePanel>
    </Collapsible>
  );
}
