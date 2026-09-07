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
            {/* `interactiveKicker`, NOT `kicker` (#1216 class, #1632 item 3): "View" IS this button's whole
                visible label, and `kicker` rides `--text-micro` (10.5px) — the footnote step, under the 11px
                functional floor for interactive copy. The kinship with the divider line it sits on survives:
                `interactiveKicker` keeps the same tracked, uppercase instrument register and moves only the
                size, to the readable 13px label step. */}
            <Text as="span" voice="interactiveKicker">
              View
            </Text>
          </Button>
        }
      />
      {/* THE MEASURE RIDES THE PARAGRAPH, NOT THE POPUP (#1175). The box used to carry `max-w-prose`, which
          is wrong twice: 65 CSS `ch` is 93-101 typographic characters in Geist (never the 65-75 band), and a
          `ch` on a WRAPPER resolves in the wrapper's font rather than the copy's — the #213/#1130 failure the
          prose token's contract names. The summary Text below takes `--reading-measure-prose` and the popup
          shrink-wraps to it. */}
      <PopoverPopup side="top" align="center">
        <Stack gap="field" className="relative max-h-96 overflow-y-auto overscroll-contain">
          <Text as="span" voice="kicker">
            Compaction summary
          </Text>
          {/* The summary is CONTENT — the prose default (§2.3 keeps `body` for content copy), spelled by
              omission rather than by an internal `size` axis. */}
          <Text className="max-w-(--reading-measure-prose) whitespace-pre-wrap" data-slot="compact-summary-text">
            {summary}
          </Text>
        </Stack>
      </PopoverPopup>
    </Popover>
  );
}
