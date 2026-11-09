// Planted layouts for the text-scale probe: a clipped control, one its own strip reaches, a column that stopped reflowing, a stacked pair and
// a control under an open toast and under a cover that is not one.
import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Grid, Stack } from "@orb/ui/layout";
import { Toaster, ToastProvider, useToastManager } from "@orb/ui/toast";
import type { ReactElement } from "react";
import { useEffect } from "react";

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

// Inside the stack's own padding, so the button's centre is under the notice's card.
const UNDER_THE_NOTICE = "fixed inset-e-0 inset-bs-(--dimension-chrome-row) me-section mbs-section";

function OpenNotice(): null {
  const { add } = useToastManager();
  useEffect(() => {
    add({ title: "A planted notice", description: "It lies over the control beneath it." });
  }, [add]);
  return null;
}

/** A control the production toast stack lies over, and one a plain absolutely placed box lies over in the same corner. */
export function PlantedCoverStory(): ReactElement {
  return (
    <CtIsolation subject="the text-scale probe" isolates="the shell, so the probe's verdict on a planted cover is the whole subject">
      <ToastProvider>
        <Stack className={UNDER_THE_NOTICE}>
          <Button data-planted="under-toast">Under the notice</Button>
        </Stack>
        <OpenNotice />
        <Toaster />
      </ToastProvider>
      <Stack className="relative inline-(--size-touch-target)" data-planted="under-box">
        <Button>Under the box</Button>
        <Stack className="absolute inset-0 bg-background" data-planted="box" />
      </Stack>
    </CtIsolation>
  );
}
