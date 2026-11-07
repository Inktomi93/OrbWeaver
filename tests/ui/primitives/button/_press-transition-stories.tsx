import { CtIsolation } from "@orb/testkit/browser";
import { keysOf } from "@orb/testkit/iso";
import { Button } from "@orb/ui/button";
import { HOVER_REVEAL } from "@orb/ui/lib";
import type { ReactElement } from "react";

/** One press-scale button per hover-reveal arm, plus one with no reveal as the control. */
export function PressTransitionStory(): ReactElement {
  return (
    <CtIsolation subject="Button" isolates="The reveal arms' transition against the press scale, without the row that reveals them">
      <div className="group">
        <Button variant="ghost">Plain</Button>
        {keysOf(HOVER_REVEAL).map((arm) => (
          <Button key={arm} reveal={arm} variant="ghost">
            {arm}
          </Button>
        ))}
      </div>
    </CtIsolation>
  );
}
