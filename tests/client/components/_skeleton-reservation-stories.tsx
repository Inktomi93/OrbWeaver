import { useFirstBootRows } from "@orb/client/components";
import { SkeletonRows, skeletonLengthFor, skeletonRowCountFor } from "@orb/client/data";
import { CtIsolation } from "@orb/testkit/browser";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useLayoutEffect, useRef, useState } from "react";

function Reservation({ rows }: { readonly rows: number }): ReactElement {
  const count = useFirstBootRows({ wide: rows, narrow: rows });
  const box = useRef<HTMLDivElement>(null);
  const [recovered, setRecovered] = useState("");
  useLayoutEffect(() => {
    setRecovered(String(skeletonRowCountFor(box.current?.getBoundingClientRect().height ?? 0, 1)));
  }, []);
  return (
    <Stack>
      <Stack reserve="exact" reserveBlock={skeletonLengthFor(count)} role="group" aria-label="Declared skeleton box" ref={box} />
      <Text role="status" aria-label="Recovered skeleton rows">
        {recovered}
      </Text>
      <SkeletonRows count={rows} />
    </Stack>
  );
}

export function SkeletonReservationStory({ rows }: { readonly rows: number }): ReactElement {
  return (
    <CtIsolation subject="Skeleton reservation" isolates="The declared row length and SkeletonRows read live tokens without application requests.">
      <Reservation rows={rows} />
    </CtIsolation>
  );
}
