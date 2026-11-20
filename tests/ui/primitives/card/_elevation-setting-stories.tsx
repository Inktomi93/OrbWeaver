import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { CtIsolation } from "@orb/testkit/browser";
import { Card } from "@orb/ui/card";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";

/** An interactive, an elevated and a static Card under one elevation value, as the shell grid stamps it, beside a probe
 *  that paints the served float-shadow recipe. */
export function ElevationSettingStory({ elevation }: { readonly elevation: AppearanceSettings["elevation"] }): ReactElement {
  return (
    <CtIsolation subject="Card elevation setting" isolates="Which raised-in-flow cards cast under each elevation value, without the shell around them">
      <div data-elevation={elevation}>
        <Card data-case="interactive" interactive={true}>
          Interactive card
        </Card>
        <Card data-case="elevated" elevated={true}>
          Elevated card
        </Card>
        <Card data-case="static">Static card</Card>
        <p data-probe="float-shadow" style={{ boxShadow: `var(${TOKENS["shadow.overlay"].cssVar})` }}>
          Recipe probe
        </p>
      </div>
    </CtIsolation>
  );
}
