// The read-only tail of the Advanced tab — none of this is a form field. Provenance (import metadata)
// renders muted rows only when non-null; unrecognized data (extensions/residualData) is a collapsed
// read-only JSON viewer; refinery `{score, analysis}` is a derived stat-figure readout.

import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Row, Section, Stack } from "@orb/ui/layout";
import type { StatFigureProps } from "@orb/ui/stat-figure";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { lazy, Suspense } from "react";

// Lazy so the ~60MB echarts package (pulled in by @orb/ui/stat-figure) never lands in the entry chunk.
const StatFigure = lazy(async () => {
  const mod = await import("@orb/ui/stat-figure");
  return { default: mod.StatFigure };
}) as (props: StatFigureProps) => ReactElement;

/** The derived refinery signals (a numeric quality score + an opaque analysis blob), or null. */
interface CharacterRefinery {
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

export function CharacterProvenanceSection({ importedFrom, importHash, extensions, residualData, refinery }: CharacterProvenanceSectionProps): ReactElement {
  return (
    <Stack gap="section">
      <Section heading="Card quality">
        {refinery === null || refinery.score === null ? (
          <Text voice="quiet">Not analyzed yet.</Text>
        ) : (
          <Suspense fallback={null}>
            <StatFigure label="Refinery score" value={refinery.score.toFixed(SCORE_DECIMALS)} />
          </Suspense>
        )}
      </Section>

      {importedFrom === null && importHash === null ? null : (
        <Section heading="Provenance">
          {importedFrom === null ? null : <ProvenanceRow label="Imported from" value={importedFrom} />}
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

/** A muted read-only provenance row (`kicker` name + `datumMono` value). The name half takes the kicker's
 *  semibold: it was micro-caps-muted at REGULAR weight, one axis short of the register it was imitating
 *  (#573 — the near-kicker class the owner ruled takes semibold rather than a fifteenth voice). */
function ProvenanceRow({ label, value }: { readonly label: string; readonly value: string }): ReactElement {
  return (
    <Row gap="row" align="center" className="flex-wrap">
      <Text voice="kicker">{label}</Text>
      <Text voice="datumMono" className="break-all">
        {value}
      </Text>
    </Row>
  );
}

/** A collapsed read-only JSON dump of a hygiene-only round-trip blob (rendered only when non-empty). */
function JsonViewer({ label, value }: { readonly label: string; readonly value: Record<string, unknown> | null }): ReactElement | null {
  if (value === null || Object.keys(value).length === 0) {
    return null;
  }
  return (
    <Collapsible>
      <CollapsibleTrigger>{label}</CollapsibleTrigger>
      <CollapsiblePanel>
        <Text as="div" voice="datumMono" className="relative overflow-auto overscroll-contain whitespace-pre-wrap">
          {JSON.stringify(value, null, 2)}
        </Text>
      </CollapsiblePanel>
    </Collapsible>
  );
}
