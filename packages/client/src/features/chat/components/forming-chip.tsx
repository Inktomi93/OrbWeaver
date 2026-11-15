// The §4.5 FORMING placeholder: the building-state chip (skeleton shimmer and a title) that stands in for markup whose
// bytes the row must not paint yet. A `:::card` whose body is still streaming shows it in the ghost row
// (`ghost-message-row.tsx`), and so does an HTML block of a styled reply until its frame draws it (D354,
// `reply-frame.tsx`). NO iframe and NO partial HTML: the segment that asks for a chip carries no bytes.

import { Card } from "@orb/ui/card";
import { Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

export function FormingChip({ title }: { readonly title: string }): ReactElement {
  return (
    // DENSITY S6: the chip is the placeholder ISLAND for what it becomes, so it stays a box — but a `<Card>`, whose
    // padding and `--radius-base` the room's instrument tier resolves, never the floating bubble's radius step (D6).
    <Card aria-busy={true}>
      <Stack gap="row" data-slot="forming-card-chip">
        <Text voice="gloss">✦ {title}: forming…</Text>
        <Skeleton width="full" height="controlMd" />
        <Skeleton variant="text" height="control" />
      </Stack>
    </Card>
  );
}
