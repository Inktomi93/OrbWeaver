// The toast-acknowledged copy, for a menu item: the menu closes on press, so a toast is the one place left
// to say what happened. A copy with a control left on screen uses `@orb/ui/copy-button`.

import type { ClipboardOutcome } from "@orb/ui/lib";
import { writeClipboardText } from "@orb/ui/lib";
import { notify } from "./notify.ts";

const COPY_FAILED = "Couldn't copy";

const FAILURE_REASON: Record<Exclude<ClipboardOutcome, "copied">, string> = {
  insecure: "This page is on plain http, and the browser only allows copying over HTTPS.",
  refused: "The browser blocked the copy.",
};

/** Copy `text` and report the outcome as a toast. `fallback` is the failure toast's next step: where the
 *  user can still copy the text by hand. */
export function copyWithNotice(text: string, fallback: string): void {
  writeClipboardText(text, (outcome) => {
    if (outcome === "copied") {
      notify.success("Copied to clipboard.");
      return;
    }
    notify.error({ title: COPY_FAILED, description: `${FAILURE_REASON[outcome]} ${fallback}` });
  });
}
