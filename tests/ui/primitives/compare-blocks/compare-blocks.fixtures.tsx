// CT harness (not a spec — Playwright CT needs mounted components in their own module, and biome
// forbids exporting a component from a `.ct.tsx`). A controlled read-write wrapper — the real
// consumer shape (the parent owns `accepted` and re-renders on every change) rather than a static
// fixture.
import type { CompareBlock, CompareDecision } from "@orb/ui/compare-blocks";
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

export interface ReviewHarnessProps {
  readonly blocks: readonly CompareBlock[];
  readonly collapseDecided?: boolean;
}

/** The R3 REVIEW grammar, controlled the way the accept surface holds it: tri-state per block, every
 *  block opening UNDECIDED (belt 10 — the fail-closed default is the harness's own initial state). */
export function ReviewHarness({ blocks, collapseDecided }: ReviewHarnessProps): ReactElement {
  const [decided, setDecided] = useState<readonly CompareDecision[]>(blocks.map(() => null));
  return (
    <CompareBlocks
      blocks={blocks}
      review={{
        decided,
        onDecide: (index, decision): void => setDecided((prev) => prev.map((d, i) => (i === index ? decision : d))),
        ...(collapseDecided === undefined ? {} : { collapseDecided }),
      }}
    />
  );
}
