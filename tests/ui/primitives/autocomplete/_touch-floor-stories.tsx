import { CtIsolation } from "@orb/testkit/browser";
import { Autocomplete } from "@orb/ui/autocomplete";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";

/** The omnibox shape (an inline autocomplete), with a probe that resolves the touch-target token in the same document. */
export function InlineAutocompleteStory(): ReactElement {
  return (
    <CtIsolation subject="Autocomplete" isolates="The input's box at each pointer class, without the corpus pane around it">
      <Autocomplete aria-label="Find a card" inline={true} items={["alpha", "beta"]} mode="none" open={true} value="al" onValueChange={(): void => undefined} />
      <span data-probe="touch-target" style={{ display: "block", blockSize: `var(${TOKENS["size.touch-target"].cssVar})` }} />
    </CtIsolation>
  );
}
