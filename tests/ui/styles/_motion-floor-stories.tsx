import { CtIsolation } from "@orb/testkit/browser";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";

/** An element animating by inline style, the strongest normal declaration the floor has to beat. */
export function MotionFloorStory(): ReactElement {
  return (
    <CtIsolation
      subject="Reduced-motion floor"
      isolates="The floor against an inline animation, under the OS query and the root attribute, without application state"
    >
      <p style={{ animationName: "orb-typing-dot", animationDuration: `var(${TOKENS["motion.ambient"].cssVar})`, animationIterationCount: "infinite" }}>
        Inline animation
      </p>
    </CtIsolation>
  );
}
