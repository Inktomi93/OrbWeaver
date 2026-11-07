import { CtIsolation } from "@orb/testkit/browser";
import { Select } from "@orb/ui/select";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";

const ITEMS = [
  { value: "ash", label: "Ash" },
  { value: "birch", label: "Birch" },
];

/** The identity-line trigger, with a probe that resolves the touch-target token in the same document. */
export function InlineSelectStory(): ReactElement {
  return (
    <CtIsolation subject="Select" isolates="The inline trigger's hit area at each pointer class, without the rpg tab around it">
      <Select aria-label="Whose pack" defaultValue="ash" items={ITEMS} layout="inline" strong={true} />
      <span data-probe="touch-target" style={{ display: "block", blockSize: `var(${TOKENS["size.touch-target"].cssVar})` }} />
    </CtIsolation>
  );
}
