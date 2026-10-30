// Two planted controls for the text-scale probe: one clipped by an ancestor that does not scroll, one its own scroller reaches.
import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

export function PlantedControlsStory(): ReactElement {
  return (
    <CtIsolation subject="the text-scale probe" isolates="the shell, so the probe's verdict on a planted control is the whole subject">
      <Stack className="overflow-hidden inline-(--size-touch-target)" data-planted="clipped">
        <Button className="shrink-0 min-inline-(--width-popup-floor)">Clipped</Button>
      </Stack>
      <Stack className="overflow-x-auto inline-(--size-touch-target)" data-planted="scrolled">
        <Button className="shrink-0 min-inline-(--width-popup-floor)">Scrolled</Button>
      </Stack>
    </CtIsolation>
  );
}
