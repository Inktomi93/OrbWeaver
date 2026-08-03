// The shared "Rhythm" stat trio (active days · longest streak · busiest day) rendered by BOTH the
// analytics overview surface and the Time tab off the same `stats.temporal` read — ONE home so the two
// can't drift (derive-modernization §W5).
import { Row, Section } from "@orb/ui/layout";
import { StatFigure } from "@orb/ui/stat-figure";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { formatCompact } from "../lib/analytics-view-model.ts";

type Temporal = inferOutput<Trpc["stats"]["temporal"]>;

export function RhythmFigures({ temporal }: { readonly temporal: Temporal }): ReactElement {
  return (
    <Section heading="Rhythm">
      <Row gap="block" className="flex-wrap">
        <StatFigure label="Active days" value={formatCompact(temporal.activeDays)} />
        <StatFigure label="Longest streak" value={`${temporal.longestStreakDays}d`} />
        <StatFigure label="Busiest day" value={temporal.busiestDay === null ? "—" : formatCompact(temporal.busiestDay.count)} />
      </Row>
    </Section>
  );
}
