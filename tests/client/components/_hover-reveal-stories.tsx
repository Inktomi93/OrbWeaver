import { HIDDEN_UNTIL_HOVER, INERT_UNTIL_HOVER, PIN_REVEAL, ROW_REVEAL } from "@orb/client/components";
import type { ReactElement } from "react";

/** One row (`group`) carrying each hover-reveal fragment the client shares, each on its own child. */
export function HoverRevealStory(): ReactElement {
  return (
    <div className="group">
      <span className={ROW_REVEAL}>row</span>
      <span className={HIDDEN_UNTIL_HOVER}>hidden</span>
      <span className={INERT_UNTIL_HOVER}>inert</span>
      <span className={PIN_REVEAL}>pin</span>
    </div>
  );
}
