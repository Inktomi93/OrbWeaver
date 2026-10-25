import { HOVER_REVEAL, INERT_UNTIL_HOVER } from "@orb/ui/lib";
import type { ReactElement } from "react";

/** One row (`group`) carrying each hover-reveal fragment, each on its own child. */
export function HoverRevealStory(): ReactElement {
  return (
    <div className="group">
      <span className={HOVER_REVEAL.interactive}>hidden</span>
      <span className={INERT_UNTIL_HOVER}>inert</span>
      <span className={HOVER_REVEAL.hover}>ui row</span>
      <span className={HOVER_REVEAL.faint}>ui pin</span>
    </div>
  );
}
