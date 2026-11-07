import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import type { HOVER_REVEAL } from "@orb/ui/lib";
import type { ReactElement } from "react";

/** Each arm names itself, so a new reveal arm fails tsc here until it is listed. */
const ARM_NAMES = { setting: "setting", hover: "hover", faint: "faint", interactive: "interactive", focus: "focus" } satisfies {
  readonly [Arm in keyof typeof HOVER_REVEAL]: Arm;
};

/** One press-scale button per hover-reveal arm, named for its arm, plus one with no reveal as the control. */
export function PressTransitionStory(): ReactElement {
  return (
    <CtIsolation subject="Button" isolates="The reveal arms' transition against the press scale, without the row that reveals them">
      <div className="group">
        <Button variant="ghost">Plain</Button>
        {Object.values(ARM_NAMES).map((arm) => (
          <Button key={arm} reveal={arm} variant="ghost">
            {arm}
          </Button>
        ))}
      </div>
    </CtIsolation>
  );
}
