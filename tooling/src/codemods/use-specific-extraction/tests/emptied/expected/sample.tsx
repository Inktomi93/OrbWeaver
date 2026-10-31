import { Badge } from "#primitives/badge";
import { GlyphButton } from "#primitives/glyph-button";
import type { ReactElement } from "react";

export function Sample(): ReactElement {
  return (
    <Badge>
      <GlyphButton aria-label="Dismiss" variant="ghost" glyph="sm" />
    </Badge>
  );
}
