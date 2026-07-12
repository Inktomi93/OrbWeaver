// ZoneSummaryStrip — the two zone chips above the rack (BUILD-SPEC §3.2): a SETUP chip + a POST chip,
// each reading the per-zone `{enabledCount, tokenEstimate}` from `derive-zones`. Pure presentation over the
// passed summaries — SETUP "n on · before the conversation · ~tok" / POST "n on · after your message · ~tok".

import { Badge } from "@orb/ui/badge";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { DerivedZones } from "./derive-zones";

export interface ZoneSummaryStripProps {
  readonly zones: DerivedZones;
}

/** One zone chip (label badge + count/where/tokens). */
function ZoneChip({
  intent,
  label,
  count,
  where,
  tokens,
}: {
  readonly intent: "info" | "warning";
  readonly label: string;
  readonly count: number;
  readonly where: string;
  readonly tokens: number;
}): ReactElement {
  return (
    <Row gap="field" align="center">
      <Badge intent={intent} size="sm">
        {label}
      </Badge>
      <Text size="micro" tone="muted">
        <Text as="span" size="micro" weight="semibold" tone="default">
          {count}
        </Text>{" "}
        on · {where} · ~{tokens}
      </Text>
    </Row>
  );
}

export function ZoneSummaryStrip({ zones }: ZoneSummaryStripProps): ReactElement {
  const { setup, post } = zones.summaries;
  return (
    <Row gap="block" align="center">
      <ZoneChip
        intent="info"
        label="SETUP"
        count={setup.enabledCount}
        where="before the conversation"
        tokens={setup.tokenEstimate}
      />
      <ZoneChip
        intent="warning"
        label="POST"
        count={post.enabledCount}
        where="after your message"
        tokens={post.tokenEstimate}
      />
    </Row>
  );
}
