import { CtIsolation } from "@orb/testkit/browser";
import { Avatar } from "@orb/ui/avatar";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";

/** An avatar inside a room that has art (`data-has-bg-image`) and one outside it, beside a probe of the hairline width token. */
export function AvatarOverArtStory(): ReactElement {
  return (
    <CtIsolation subject="Avatar over art" isolates="The avatar's ring over a room's art keeps the width its merged class list names">
      <div data-has-bg-image="">
        <Avatar alt="Over art" />
      </div>
      <div>
        <Avatar alt="Plain room" />
      </div>
      <span data-probe="hairline" style={{ display: "block", borderStyle: "solid", borderWidth: `var(${TOKENS["border-width.hairline"].cssVar})` }} />
    </CtIsolation>
  );
}
