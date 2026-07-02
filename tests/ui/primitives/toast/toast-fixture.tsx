// CT fixture — Playwright CT cannot mount components defined inside .ct.tsx files, and the
// imperative toast API is a hook, so the harness component lives here.
import { useToastManager } from "@orb/ui/toast";
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
      <button
        onClick={(): void => {
          toastManager.add({
            title: "Character created",
            actionProps: {
              children: "Open character",
              onClick: (): void => {
                toastManager.add({ title: "Opened" });
              },
            },
          });
        }}
        type="button"
      >
        add toast with action
      </button>
    </div>
  );
}

// No ToastProvider/Toaster here — the CT harness (CtProviders via beforeMount) supplies both
// globally, so the imperative useToastManager() below binds to the ambient app-wide manager.
export function ToastPlayground(): ReactElement {
  return <ToastButtons />;
}
