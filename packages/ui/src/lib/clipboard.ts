// The one clipboard write. The async Clipboard API exists only in a secure context, and this app
// can be served over plain http on a LAN, so "no clipboard" is a normal outcome, reported apart from a refusal.
// `lib/` compiles without the DOM lib, so the globals are read through structural types.

/** What a write came to: on the clipboard, impossible on an insecure page, or refused by the browser. */
const CLIPBOARD_OUTCOMES = ["copied", "insecure", "refused"] as const;
export type ClipboardOutcome = (typeof CLIPBOARD_OUTCOMES)[number];

interface ClipboardGlobals {
  readonly isSecureContext?: boolean;
  readonly navigator?: { readonly clipboard?: { readonly writeText: (text: string) => Promise<void> } };
}

/**
 * Write `text` to the system clipboard and hand the outcome to `settle`. The seam owns the promise and its
 * rejection, so a caller never holds one. `settle` always runs after the caller returns, so a click that
 * clears its status first has that clear committed before the outcome lands.
 */
export function writeClipboardText(text: string, settle: (outcome: ClipboardOutcome) => void): void {
  const globals = globalThis as ClipboardGlobals;
  const clipboard = globals.navigator?.clipboard;
  if (clipboard === undefined) {
    const outcome = globals.isSecureContext === false ? "insecure" : "refused";
    queueMicrotask(() => settle(outcome));
    return;
  }
  // @orb-waive caught-failure-ownership(clipboard.writeText): the rejection IS the `refused` outcome, and every caller surfaces it (CopyButton's status and manual-copy field, copyWithNotice's toast). Ends if a caller needs the rejection's reason.
  clipboard.writeText(text).then(
    () => settle("copied"),
    () => settle("refused"),
  );
}
