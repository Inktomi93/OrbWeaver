import { Badge } from "@orb/ui/badge";
import { Dices, Icon } from "@orb/ui/icons";
import type { ReactElement } from "react";

declare const size: "sm" | "dot";

// The dot and inline sites name their style or leave it where both defaults agree. A dot that leaves `variant` to
// Badge's soft default would become a solid dot, so it is refused; a computed size and a scale step stay.
export function Sample(): ReactElement {
  return (
    <p>
      <Badge size="inline" tone="info">
        <Icon icon={Dices} size="xs" />
        roll
      </Badge>
      <Badge className="me-field" size="inline" />
      <Badge tone="primary" variant="solid" size="dot" aria-hidden={true} />
      <Badge size="dot" tone="primary" />
      <Badge size={size} />
      <Badge size="sm">Stays a Badge</Badge>
    </p>
  );
}
