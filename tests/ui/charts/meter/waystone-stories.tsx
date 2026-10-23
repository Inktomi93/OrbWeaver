import { CtIsolation } from "@orb/testkit/browser";
import type { WaystoneProps } from "@orb/ui/meter";
import { Waystone } from "@orb/ui/meter";
import type { ReactElement } from "react";

export function WaystoneStory(props: WaystoneProps): ReactElement {
  return (
    <CtIsolation subject="Waystone" isolates="Domain-free clock and weather rendering through the public meter component">
      <Waystone {...props} />
    </CtIsolation>
  );
}
