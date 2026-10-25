import { HIDDEN_UNTIL_HOVER } from "@orb/client/components";
import { CtIsolation } from "@orb/testkit/browser";
import { HOVER_REVEAL, INERT_UNTIL_HOVER } from "@orb/ui/lib";
import type { ReactElement } from "react";

/** One row (`group`) carrying each hover-reveal fragment, each on its own child. */
export function HoverRevealStory(): ReactElement {
  return (
    <CtIsolation subject="Hover-reveal fragments" isolates="The class fragments reveal on a row hover and need no application services.">
      <div className="group">
        <span className={HIDDEN_UNTIL_HOVER}>hidden</span>
        <span className={INERT_UNTIL_HOVER}>inert</span>
        <span className={HOVER_REVEAL.hover}>ui row</span>
        <span className={HOVER_REVEAL.faint}>ui pin</span>
      </div>
    </CtIsolation>
  );
}
