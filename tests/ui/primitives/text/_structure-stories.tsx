import { CtIsolation } from "@orb/testkit/browser";
import { HintTrigger } from "@orb/ui/hint-trigger";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

const LONG_LINES = Array.from({ length: 40 }, (_unused, index) => `line ${String(index)} of a serialized block`).join("\n");

/** A scrolling code block named as a region, beside a hinted field row. */
export function ScrollAndHintStory(): ReactElement {
  return (
    <CtIsolation subject="Text scroll, HintTrigger" isolates="A scrolling box is a named tab stop, and the hint's inline trigger is a 24px target">
      <Text aria-label="Scrolling block" role="region" scroll="y" maxHeight="scrollSm" voice="code" whitespace="preWrap">
        {LONG_LINES}
      </Text>
      <HintTrigger hint="What this field means" subject="Word count" />
    </CtIsolation>
  );
}
