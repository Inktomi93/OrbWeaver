import { useFirstBootBox } from "@orb/client/components";
import { SkeletonRows, skeletonRowCountFor } from "@orb/client/data";
import { CtIsolation } from "@orb/testkit/browser";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

function Reservation({ rows }: { readonly rows: number }): ReactElement {
  const box = useFirstBootBox({ wide: rows, narrow: rows });
  return (
    <Stack>
      <Text role="status" aria-label="Declared skeleton height">
        {String(box)}
      </Text>
      <Text role="status" aria-label="Recovered skeleton rows">
        {String(skeletonRowCountFor(box ?? 0, 1))}
      </Text>
      <SkeletonRows count={rows} />
    </Stack>
  );
}

export function SkeletonReservationStory({ rows }: { readonly rows: number }): ReactElement {
  return (
    <CtIsolation subject="Skeleton reservation" isolates="The reservation hook and SkeletonRows read live tokens without application requests.">
      <Reservation rows={rows} />
    </CtIsolation>
  );
}
