import { Badge } from "#primitives/badge";
import { Button } from "#primitives/button";
import type { ReactElement } from "react";

export function Sample(): ReactElement {
  return (
    <Badge>
      <Button aria-label="Dismiss" variant="ghost" size="glyph-sm" />
    </Badge>
  );
}
