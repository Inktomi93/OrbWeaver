import { SkipToFirstRow } from "@orb/client/components";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import type { ReactElement } from "react";
import { useRef } from "react";

/** A list pane's skip link in front of its chrome, with the real list rows it lands on. */
export function SkipToFirstRowStory(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  return (
    <Stack ref={surfaceRef}>
      <SkipToFirstRow containerRef={surfaceRef}>Skip to rows</SkipToFirstRow>
      <Button>Search chrome</Button>
      <ListRow clickable={true} onClick={(): void => undefined} title="First row" />
      <ListRow clickable={true} onClick={(): void => undefined} title="Second row" />
    </Stack>
  );
}
