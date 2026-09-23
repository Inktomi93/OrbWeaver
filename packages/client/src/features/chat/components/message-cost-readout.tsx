// The per-message settled-cost affordance. `connection.generationCost` is a PAID upstream
// call (OpenRouter's `GET /generation`), resolved against the connection row that generated the swipe, so it
// is NEVER fired on load: this renders a quiet click-to-reveal trigger, and only a
// user click builds the query key (via `useGatedQuery`'s skipToken gate). The settled cost is immutable, so
// it caches forever (staleTime Infinity). The revealed datum is quiet micro-mono-muted text (north-star P5),
// NOT a pill — matching the sibling gen-duration readout. What makes the affordance renderable at all is
// {@link canRevealGenerationCost} (`../lib/message-readout.ts`) — the ONE home for that decision, shared
// with the metadata row that decides whether to give this readout a slot.

import type { MessageView } from "@orb/contracts/chat";
import type { UserConnectionId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Coins, Icon } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { useGatedQuery, useTRPC } from "#data";
import { canRevealGenerationCost } from "../lib/message-readout.ts";

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

export function MessageCostReadout({ message }: { readonly message: MessageView }): ReactElement | null {
  const trpc = useTRPC();
  const [revealed, setRevealed] = useState(false);
  const { generationId, connectionId } = message;
  const settleable = canRevealGenerationCost(message);
  // The key is built ONLY once revealed AND the row is settleable — until then `useGatedQuery` skips the
  // fetch. The two null re-checks are what narrows the pair for `tsc`; `settleable` is the decision.
  const gateKey = revealed && settleable && generationId !== null && connectionId !== null ? { generationId, connectionId } : undefined;
  const query = useGatedQuery(gateKey, (key: { readonly generationId: string; readonly connectionId: UserConnectionId }) =>
    trpc.connection.generationCost.queryOptions(key, { staleTime: Number.POSITIVE_INFINITY }),
  );

  if (!settleable) {
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
        <Text voice="gloss" className="font-mono">
          cost
        </Text>
      </Button>
    );
  }

  return (
    <Text voice="gloss" className="font-mono" data-slot="message-metadata-cost">
      {costLabel(query.isError, query.data?.totalCost)}
    </Text>
  );
}
