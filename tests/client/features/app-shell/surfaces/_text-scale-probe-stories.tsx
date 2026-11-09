// Planted layouts for the text-scale probe: a clipped control, one its own strip reaches, a column that stopped reflowing and a stacked pair.
import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Grid, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

export function PlantedControlsStory(): ReactElement {
  return (
    <CtIsolation subject="the text-scale probe" isolates="the shell, so the probe's verdict on a planted control is the whole subject">
      <Stack className="overflow-hidden inline-(--size-touch-target)" data-planted="clipped">
        <Button className="shrink-0 min-inline-(--width-popup-floor)">Clipped</Button>
      </Stack>
      <Stack className="overflow-x-auto inline-(--size-touch-target)" data-planted="scrolled" role="toolbar">
        <Button className="shrink-0 min-inline-(--width-popup-floor)">Scrolled</Button>
      </Stack>
      <Stack className="overflow-x-auto inline-(--size-touch-target)" data-planted="sideways">
        <Button className="shrink-0 min-inline-(--width-popup-floor)">Sideways</Button>
      </Stack>
      <Grid className="inline-(--size-touch-target)" cols="cellSwipe" data-planted="declared">
        <Button>Declared</Button>
        <Button>Strip</Button>
      </Grid>
      <Stack data-planted="stacked">
        <Button>Under</Button>
        <Button className="-mbs-(--size-control-md)">Over</Button>
      </Stack>
    </CtIsolation>
  );
}
