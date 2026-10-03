// The shared "Rhythm" stat trio (active days · longest streak · busiest day) rendered by BOTH the
// analytics overview surface and the Time tab off the same viewer-local fold of `stats.timeseries` — ONE
// home so the two can't drift.
import { Row, Section, Stack } from "@orb/ui/layout";
import { StatFigure } from "@orb/ui/stat-figure";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { Rhythm } from "../lib/analytics-view-model.ts";
import { formatCompact } from "../lib/analytics-view-model.ts";

export function RhythmFigures({ rhythm }: { readonly rhythm: Rhythm }): ReactElement {
  const busiest = rhythm.busiestDay;
  return (
    <Section heading="Rhythm">
      <Stack gap="block">
        <Row gap="block" className="flex-wrap">
          <StatFigure label="Active days" value={formatCompact(rhythm.activeDays)} />
          <StatFigure label="Longest streak" value={`${rhythm.longestStreakDays}d`} />
          {/* THE UNIT IS IN THE LABEL, THE DAY IS IN THE GLOSS (P3d). This tile printed a bare `260` under
              "Busiest day" — neither the unit (260 of what?) nor the day it happened, which is the one
              fact the label promises. The count is turns exchanged PLUS chats opened (`LocalDay.activity`);
              the gloss below names both the day and that definition. */}
          <StatFigure label="Busiest day (activity)" value={busiest === null ? "—" : formatCompact(busiest.count)} />
        </Row>
        <Text voice="gloss">
          {busiest === null
            ? "A day counts as active once you exchange a turn or open a chat in it."
            : `Your busiest day was ${busiest.day} — activity counts turns exchanged plus chats opened.`}
        </Text>
      </Stack>
    </Section>
  );
}
