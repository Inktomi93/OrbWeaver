// CT fixture — Playwright CT cannot mount components defined inside .ct.tsx files, and the
// imperative toast API is a hook, so the harness component lives here.
import { Toaster, ToastProvider, useToastManager } from "@orb/ui/toast";
import type { ReactElement } from "react";

const QUICK_TIMEOUT_MS = 500;

function ToastButtons(): ReactElement {
  const toastManager = useToastManager();
  return (
    <div>
      <button
        onClick={(): void => {
          toastManager.add({ title: "Saved", description: "All changes stored." });
        }}
        type="button"
      >
        add toast
      </button>
      <button
        onClick={(): void => {
          toastManager.add({ title: "Quick", timeout: QUICK_TIMEOUT_MS });
        }}
        type="button"
      >
        add quick toast
      </button>
    </div>
  );
}

export function ToastPlayground(): ReactElement {
  return (
    <ToastProvider>
      <ToastButtons />
      <Toaster />
    </ToastProvider>
  );
}
