// CT harness (not a spec — Playwright CT needs mounted components in their own module, and biome
// forbids exporting a component from a `.ct.tsx`). A controlled read-write wrapper — the real
// consumer shape (the parent owns `accepted` and re-renders on every change) rather than a static
// fixture.
import type { CompareBlock } from "@orb/ui/compare-blocks";
import { CompareBlocks } from "@orb/ui/compare-blocks";
import type { ReactElement } from "react";
import { useState } from "react";

export interface AcceptHarnessProps {
  readonly blocks: readonly CompareBlock[];
  readonly initialAccepted: readonly boolean[];
  readonly acceptAllLabel?: string;
}

export function AcceptHarness({ blocks, initialAccepted, acceptAllLabel }: AcceptHarnessProps): ReactElement {
  const [accepted, setAccepted] = useState<readonly boolean[]>(initialAccepted);
  return <CompareBlocks {...(acceptAllLabel === undefined ? {} : { acceptAllLabel })} accepted={accepted} blocks={blocks} onAcceptedChange={setAccepted} />;
}
