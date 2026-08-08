// CT fixture — Playwright CT cannot mount components defined inside .ct.tsx files, and the
// imperative toast API is a hook, so the harness component lives here.
import { useToastManager } from "@orb/ui/toast";
import type { ReactElement } from "react";

const QUICK_TIMEOUT_MS = 500;

// Long enough that the copy genuinely runs the full content width — a SHORT title proves nothing about
// the close button's overlap, because the block box is full-width either way but the ink is not.
const LONG_TITLE = "Your preset's custom parameters weren't sent on this turn";
const LONG_DESCRIPTION = "OpenRouter ignores them. They apply only on a Custom OpenAI-compatible connection, so nothing about this reply changed.";

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
          toastManager.add({ title: "Working…", type: "loading" });
        }}
        type="button"
      >
        add loading toast
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
      <button
        onClick={(): void => {
          toastManager.add({ title: LONG_TITLE, description: LONG_DESCRIPTION });
        }}
        type="button"
      >
        add long toast
      </button>
      <button
        onClick={(): void => {
          toastManager.add({ title: "Custom parameters weren't sent", description: LONG_DESCRIPTION, type: "warning" });
        }}
        type="button"
      >
        add warning toast
      </button>
    </div>
  );
}

// No ToastProvider/Toaster here — the CT harness (CtProviders via beforeMount) supplies both
// globally, so the imperative useToastManager() below binds to the ambient app-wide manager.
export function ToastPlayground(): ReactElement {
  return <ToastButtons />;
}

// The production adjacency the toast viewport has to clear: a bottom-anchored, full-width band standing
// in for the chat composer (whose trailing Send button the toast stack was measured covering at 94%).
// A fixed band, not a flow element — the defect is between two FIXED layers, so a flow stand-in would
// prove nothing.
export function ToastOverComposerPlayground(): ReactElement {
  return (
    <div>
      <ToastButtons />
      <div data-composer-standin="true" style={{ background: "#333", bottom: 0, height: "96px", insetInline: 0, position: "fixed" }} />
    </div>
  );
}
