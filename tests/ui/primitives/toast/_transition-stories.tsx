import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Toaster, ToastProvider, useToastManager } from "@orb/ui/toast";
import type { ReactElement } from "react";

function AddToast(): ReactElement {
  const toasts = useToastManager();
  return <Button onClick={(): unknown => toasts.add({ title: "Saved", description: "Your change landed" })}>Add toast</Button>;
}

export function ToastTransitionStory(): ReactElement {
  return (
    <CtIsolation subject="Toast" isolates="The toast skin's transition contract needs no application services.">
      <ToastProvider>
        <AddToast />
        <Toaster />
      </ToastProvider>
    </CtIsolation>
  );
}
