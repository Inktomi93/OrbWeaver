import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Toaster, ToastProvider, useToastManager } from "@orb/ui/toast";
import type { ReactElement } from "react";
import { useState } from "react";

function AddToast(): ReactElement {
  const toasts = useToastManager();
  return (
    <Button
      onClick={(): void => {
        toasts.add({ title: "Saved", description: "Your change landed" });
      }}
    >
      Add toast
    </Button>
  );
}

/** A page action the test moves under the stack's box, between two notices, and a counter that shows the click landed. */
export function ToastGapStory(): ReactElement {
  const [presses, setPresses] = useState(0);
  return (
    <CtIsolation subject="Toast" isolates="Where the stack takes input needs no application services.">
      <ToastProvider>
        <Row justify="end">
          <AddToast />
        </Row>
        <Button data-planted="probe" onClick={(): void => setPresses((count) => count + 1)}>
          Probe action
        </Button>
        <Text as="p" voice="reading">
          {`Presses: ${String(presses)}`}
        </Text>
        <Toaster />
      </ToastProvider>
    </CtIsolation>
  );
}

export function ToastTransitionStory(): ReactElement {
  return (
    <CtIsolation subject="Toast" isolates="The toast skin's transition contract needs no application services.">
      <ToastProvider>
        <Stack gap="section">
          <Text as="p" voice="reading">
            A notice preserves access to the page below its padding.
          </Text>
          <Row justify="end">
            <AddToast />
          </Row>
        </Stack>
        <Toaster />
      </ToastProvider>
    </CtIsolation>
  );
}
