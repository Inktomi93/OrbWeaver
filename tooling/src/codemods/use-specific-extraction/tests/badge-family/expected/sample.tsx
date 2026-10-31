import { Badge } from "@orb/ui/badge";
import { InlineToken } from "@orb/ui/inline-token";
import { IndicatorDot } from "@orb/ui/indicator-dot";
import { Dices, Icon } from "@orb/ui/icons";
import type { ReactElement } from "react";

declare const size: "sm" | "dot";

// The dot and inline sites name their style or leave it where both defaults agree. A dot that leaves `variant` to
// Badge's soft default would become a solid dot, so it is refused; a computed size and a scale step stay.
export function Sample(): ReactElement {
  return (
    <p>
      <InlineToken tone="info">
        <Icon icon={Dices} size="xs" />
        roll
      </InlineToken>
      <InlineToken className="me-field" />
      <IndicatorDot tone="primary" variant="solid" aria-hidden={true} />
      <Badge size="dot" tone="primary" />
      <Badge size={size} />
      <Badge size="sm">Stays a Badge</Badge>
    </p>
  );
}
