// The context-boundary divider's compaction PEEK: an inline popover that reveals the LINEAR-tier compaction
// summary text standing in for the messages above the boundary (the #9 COMPACTION marker). Read-only; the
// house uncontrolled-popover idiom. Split out from message-row-parts.tsx so the component lives in a
// components-only module (the fast-refresh export rule).
//
// VOCAB (repaired 2026-08-02): the noun is COMPACTION, never "memory". Compaction writes its own
// `chats.compactSummary` — the Memory plane is a different subsystem entirely, and naming this one after it
// told the reader their compacted turns had been filed somewhere they had not.

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
          <Button type="button" intent="ghost" size="sm" data-slot="compact-summary-peek" aria-label="View compaction summary" className="shrink-0">
            {/* Speaks the divider's own `kicker` voice — it sits on that line and reads as part of it. */}
            <Text as="span" voice="kicker">
              View
            </Text>
          </Button>
        }
      />
      <PopoverPopup side="top" align="center" className="max-w-prose">
        <Stack gap="field" className="max-h-96 overflow-y-auto">
          <Text as="span" voice="kicker">
            Compaction summary
          </Text>
          {/* The summary is CONTENT — the prose default (§2.3 keeps `body` for content copy), spelled by
              omission rather than by an internal `size` axis. */}
          <Text className="whitespace-pre-wrap" data-slot="compact-summary-text">
            {summary}
          </Text>
        </Stack>
      </PopoverPopup>
    </Popover>
  );
}
