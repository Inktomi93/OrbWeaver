import { CtIsolation } from "@orb/testkit/browser";
import { Card } from "@orb/ui/card";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";

export function ElevationStory(): ReactElement {
  return (
    <CtIsolation subject="Card elevation" isolates="The shadow-overlay utility against the served recipe, across the seed themes, without application state">
      <Card elevated={true}>Elevated card</Card>
      <p style={{ boxShadow: `var(${TOKENS["shadow.overlay"].cssVar})` }}>Recipe probe</p>
    </CtIsolation>
  );
}
