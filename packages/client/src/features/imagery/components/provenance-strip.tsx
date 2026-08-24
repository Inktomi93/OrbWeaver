// The lightbox's provenance detail strip (interaction-direction-spec.md §7 B5) — `imagery.readProvenance`
// over the viewed asset. Owner-scoped by construction (the verb joins through `assets.ownerId`); a stranger
// or a non-generated image reads `null`, which is a first-class DATA state ("no details"), never an error.
// The three honest arms are all load-bearing: pending → skeleton, error → a retryable line, null/loaded →
// the strip. Non-suspending (`useQuery`) so the modal's image paints immediately and the strip fills in.

import type { AssetId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { SkeletonRows, useTRPC } from "#data";

// A generated cost is dollars; show four decimals (a single image is fractions of a cent to a few cents).
const COST_DECIMALS = 4;
function formatCost(costUsd: number): string {
  return `$${costUsd.toFixed(COST_DECIMALS)}`;
}

export function ProvenanceStrip({ assetId }: { readonly assetId: AssetId }): ReactElement {
  const trpc = useTRPC();
  const { data, isPending, isError } = useQuery(trpc.imagery.readProvenance.queryOptions({ assetId }));

  if (isPending) {
    return <SkeletonRows count={2} shape="line" />;
  }
  if (isError) {
    return (
      <Text voice="gloss" data-slot="provenance-error">
        Couldn't load this image's details.
      </Text>
    );
  }
  if (data === null) {
    return (
      <Text voice="gloss" data-slot="provenance-empty">
        No generation details recorded for this image.
      </Text>
    );
  }

  return (
    <Stack gap="field" data-slot="provenance">
      <Text voice="reading" data-slot="provenance-prompt">
        {data.prompt}
      </Text>
      <Row className="flex-wrap" gap="tight">
        <Badge intent="neutral" size="sm" tone="soft">
          {data.model}
        </Badge>
        <Badge intent="neutral" size="sm" tone="soft">
          {data.mode}
        </Badge>
        {data.edited ? (
          <Badge intent="neutral" size="sm" tone="soft">
            Edited
          </Badge>
        ) : null}
        {data.costUsd === null ? null : (
          <Badge intent="neutral" size="sm" tone="soft">
            {formatCost(data.costUsd)}
          </Badge>
        )}
      </Row>
    </Stack>
  );
}
