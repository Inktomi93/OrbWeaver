// The shared "Rhythm" stat trio (active days · longest streak · busiest day) rendered by BOTH the
// analytics overview surface and the Time tab off the same `stats.temporal` read — ONE home so the two
// can't drift (derive-modernization §W5).
import { Row, Section, Stack } from "@orb/ui/layout";
import { StatFigure } from "@orb/ui/stat-figure";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { formatCompact } from "../lib/analytics-view-model.ts";

type Temporal = inferOutput<Trpc["stats"]["temporal"]>;

export function RhythmFigures({ temporal }: { readonly temporal: Temporal }): ReactElement {
  const busiest = temporal.busiestDay;
  return (
    <Section heading="Rhythm">
      <Stack gap="block">
        <Row gap="block" className="flex-wrap">
          <StatFigure label="Active days" value={formatCompact(temporal.activeDays)} />
          <StatFigure label="Longest streak" value={`${temporal.longestStreakDays}d`} />
          {/* THE UNIT IS IN THE LABEL, THE DAY IS IN THE GLOSS (P3d). This tile printed a bare `260` under
              "Busiest day" — neither the unit (260 of what?) nor the day it happened, which is the one
              fact the label promises. The count is turns exchanged PLUS chats opened (the server's
              `dailyActivity` definition); the gloss below names both the day and that definition. */}
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
