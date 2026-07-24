// The context-boundary divider's memory PEEK: an inline popover that reveals the LINEAR-tier compaction
// summary text standing in for the messages above the boundary (the #9 memory marker). Read-only; the house
// uncontrolled-popover idiom. Split out from message-row-parts.tsx so the component lives in a components-only
// module (the fast-refresh export rule).

import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

/** The peek trigger + popup: "View" opens a scrollable readout of the compaction summary. */
export function CompactSummaryPeek({ summary }: { readonly summary: string }): ReactElement {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" intent="ghost" size="sm" data-slot="compact-summary-peek" aria-label="View memory summary" className="shrink-0">
            <Text as="span" size="micro" tone="muted" transform="caps">
              View
            </Text>
          </Button>
        }
      />
      <PopoverPopup side="top" align="center" className="max-w-prose">
        <Stack gap="field" className="max-h-96 overflow-y-auto">
          <Text as="span" size="label" tone="muted" transform="caps">
            Memory summary
          </Text>
          <Text size="body" className="whitespace-pre-wrap" data-slot="compact-summary-text">
            {summary}
          </Text>
        </Stack>
      </PopoverPopup>
    </Popover>
  );
}
