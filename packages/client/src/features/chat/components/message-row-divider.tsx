// The context-boundary divider, split from message-row-parts at the component-size cap — one renderer,
// one consumer (message-row.tsx). Everything else about the row stays in message-row-parts.
import { Row } from "@orb/ui/layout";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import type { ReactNode } from "react";
import { CompactSummaryPeek } from "./compact-summary-peek.tsx";
export function renderContextBoundaryDivider(show: boolean, budgetLabel?: string | undefined, compactSummary?: string | null | undefined): ReactNode {
  if (!show) {
    return null;
  }
  const compacted = compactSummary !== null && compactSummary !== undefined && compactSummary.length > 0;
  return (
    <Row gap="field" align="center" data-slot="context-boundary-divider" className="w-full">
      <Separator className="flex-1 bg-(--color-primary)/35" />
      {/* The divider NAMES a region of the transcript ("everything below is in context") — the `kicker`
          voice, which is exactly the caps-micro-with-a-hairline shape this line was already assembling by
          hand. The noun is COMPACTION, never memory: compaction writes `chats.compactSummary`, its own
          summary — the Memory plane is a different subsystem (vocab repair, 2026-08-02). */}
      {/* On a plate: the line crosses the room's background art, and the numbers on it must read at AA
          whatever part of the photo sits behind them. The hairlines meet the plate, not the text. */}
      <Row gap="field" align="center" className="rounded-base bg-background/80 px-tight">
        <Text voice="kicker">
          {compacted ? "Older messages compacted into a summary" : "In context from here"}
          {budgetLabel !== undefined ? ` · ${budgetLabel}` : ""}
        </Text>
        {compacted ? <CompactSummaryPeek summary={compactSummary} /> : null}
      </Row>
      <Separator className="flex-1 bg-(--color-primary)/35" />
    </Row>
  );
}
