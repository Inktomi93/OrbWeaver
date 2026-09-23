// The DATA view's CONTEXT readout: per-variable / per-macro REFERENCE
// COUNTS within this preset — which sections, templates, nudges and macro bodies write `{{name}}`.
//
// Informs: "is this safe to rename or delete, and where do I look first?" A reference to a SECTION is a
// sanctioned selection echo (§16 row 19) through the one store action; a template/nudge reference has no
// rack row, so it prints as a plain site.
//
// A ZERO count reads "no references in this preset" — never "dead" (`reference-scan.ts` states why).

import type { PromptConfig } from "@orb/contracts/preset";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { selectPresetSection } from "#state";
import type { ReferenceCount, ReferenceSite } from "../../lib/reference-scan.ts";
import { scanReferences } from "../../lib/reference-scan.ts";

export function DataReadout({ config }: { readonly config: PromptConfig }): ReactElement {
  const counts = scanReferences(config);
  return (
    <Section kicker="References — this preset">
      {counts.length === 0 ? (
        <Text voice="gloss">This preset declares no variables or user macros yet. Add one in the Data view and its references show up here.</Text>
      ) : (
        <Stack gap="field">
          {counts.map((entry) => (
            <ReferenceEntry entry={entry} key={`${entry.kind}:${entry.name}`} />
          ))}
        </Stack>
      )}
      <Text voice="gloss">Counted inside this preset only — a macro can still be used at chat time somewhere this scan cannot see.</Text>
    </Section>
  );
}

function ReferenceEntry({ entry }: { readonly entry: ReferenceCount }): ReactElement {
  const count = entry.sites.length;
  return (
    <Stack gap="tight">
      <Row align="baseline" gap="row" justify="between">
        <Text voice="datum">{`{{${entry.name}}}`}</Text>
        {count === 0 ? (
          <Badge intent="warning" size="sm">
            0 refs
          </Badge>
        ) : (
          <Text voice="gloss">{`${count} ref${count === 1 ? "" : "s"}`}</Text>
        )}
      </Row>
      {count === 0 ? (
        <Text voice="gloss">no references in this preset</Text>
      ) : (
        <Row gap="tight">
          {entry.sites.map((site, at) => (
            <SiteChip key={`${site.label}-${String(at)}`} site={site} />
          ))}
        </Row>
      )}
    </Stack>
  );
}

/** One reference site. A SECTION site is clickable — the echo selects its rack row; a template/nudge site
 *  has no row to select, so it stays a plain gloss rather than a button that does nothing. */
function SiteChip({ site }: { readonly site: ReferenceSite }): ReactElement {
  const sectionId = site.sectionId;
  if (sectionId === undefined) {
    return <Text voice="gloss">{site.label}</Text>;
  }
  return (
    <Button intent="ghost" onClick={(): void => selectPresetSection(sectionId)} size="sm" type="button">
      {site.label}
    </Button>
  );
}
