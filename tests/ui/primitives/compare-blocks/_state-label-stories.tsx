import { CtIsolation } from "@orb/testkit/browser";
import type { CompareBlock } from "@orb/ui/compare-blocks";
import { CompareBlocks } from "@orb/ui/compare-blocks";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

const BLOCKS: readonly CompareBlock[] = [{ label: "Note", before: "Old line one", after: "New line one" }];

/** An undecided review block in a phone-wide results pane: its state chip carries the longest state words. */
export function UndecidedReviewPaneStory(): ReactElement {
  return (
    <CtIsolation
      subject="CompareBlocks"
      isolates="The state chip's words against a narrow results pane at enlarged text, without the refinery session around the block"
    >
      <Stack className="overflow-x-auto" container={true} data-probe="pane">
        <CompareBlocks blocks={BLOCKS} review={{ decided: [null], onDecide: (): void => undefined }} />
      </Stack>
    </CtIsolation>
  );
}
