// PD-137 — the per-message settled-cost affordance. `connection.orGenerationCost` is a PAID upstream
// OpenRouter call, so it is NEVER fired on load: this renders a quiet click-to-reveal trigger, and only a
// user click builds the query key (via `useGatedQuery`'s skipToken gate). The settled cost is immutable, so
// it caches forever (staleTime Infinity). The revealed datum is quiet micro-mono-muted text (north-star P5),
// NOT a pill — matching the sibling gen-duration readout. Renders nothing without a `generationId` (a non-OR
// or user/system row has none).

import type { MessageView } from "@orb/contracts/chat";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome can't follow @orb/ui/icons' lucide-react re-export barrel (external .d.ts); tsc/vite resolve it fine (the swipe-strip.tsx precedent).
import { Coins, Icon } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { useGatedQuery, useTRPC } from "#data";

/** USD costs are sub-cent; four decimals keeps `$0.0023`-scale precision readable without noise. */
const COST_FRACTION_DIGITS = 4;

function formatCost(totalCost: number): string {
  return `$${totalCost.toFixed(COST_FRACTION_DIGITS)}`;
}

/** The revealed readout label: error → n/a, in-flight → ellipsis, settled → the formatted cost. */
function costLabel(isError: boolean, totalCost: number | undefined): string {
  if (isError) {
    return "cost n/a";
  }
  if (totalCost === undefined) {
    return "…";
  }
  return formatCost(totalCost);
}

export function MessageCostReadout({
  message,
}: {
  readonly message: MessageView;
}): ReactElement | null {
  const trpc = useTRPC();
  const [revealed, setRevealed] = useState(false);
  const { generationId } = message;
  // The key is built ONLY once revealed AND a handle exists — until then `useGatedQuery` skips the fetch.
  const gateKey = revealed && generationId !== null ? generationId : undefined;
  const query = useGatedQuery(gateKey, (id: string) =>
    trpc.connection.orGenerationCost.queryOptions(
      { generationId: id },
      { staleTime: Number.POSITIVE_INFINITY },
    ),
  );

  if (generationId === null) {
    return null;
  }

  if (!revealed) {
    return (
      <Button
        type="button"
        intent="ghost"
        size="sm"
        aria-label="Show generation cost"
        onClick={(): void => setRevealed(true)}
        data-slot="message-metadata-cost-trigger"
      >
        <Icon icon={Coins} size="xs" />
        <Text size="micro" tone="muted" className="font-mono">
          cost
        </Text>
      </Button>
    );
  }

  return (
    <Text size="micro" tone="muted" className="font-mono" data-slot="message-metadata-cost">
      {costLabel(query.isError, query.data?.totalCost)}
    </Text>
  );
}
