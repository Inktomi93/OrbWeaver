// The toast-acknowledged copy, for a copy with no control left on screen (a menu item, a copy after a
// submit): a toast is the one place left to say what happened. A copy button uses `@orb/ui/copy-button`.

import type { ClipboardOutcome } from "@orb/ui/lib";
import { writeClipboardText } from "@orb/ui/lib";
import { notify } from "./notify.ts";

const COPY_FAILED = "Couldn't copy";

const FAILURE_REASON: Record<Exclude<ClipboardOutcome, "copied">, string> = {
  insecure: "This page is on plain http, and the browser only allows copying over HTTPS.",
  refused: "The browser blocked the copy.",
};

/**
 * Copy `text` and report the outcome as a toast. `copied` is the success title; `fallback` names where
 * the user can still copy the text by hand when the write fails.
 */
export async function copyWithNotice(text: string, notice: { readonly copied?: string; readonly fallback?: string } = {}): Promise<void> {
  const outcome = await writeClipboardText(text);
  if (outcome === "copied") {
    notify.success(notice.copied ?? "Copied to clipboard.");
    return;
  }
  const reason = FAILURE_REASON[outcome];
  notify.error({ title: COPY_FAILED, description: notice.fallback === undefined ? reason : `${reason} ${notice.fallback}` });
}
