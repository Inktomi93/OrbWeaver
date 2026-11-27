import { CtClientProviders, CtUserBus } from "@orb/testkit/browser";
import type { ReactElement } from "react";

/** The app root's socket and user bus, mounted with the toast surface the user bus's room failure reaches. */
export function RoomFailedStory(): ReactElement {
  return (
    <CtClientProviders>
      <CtUserBus>
        <p>Signed in</p>
      </CtUserBus>
    </CtClientProviders>
  );
}
