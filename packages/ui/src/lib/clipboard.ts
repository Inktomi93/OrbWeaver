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

/** Write `text` to the system clipboard. Never rejects: every failure resolves to its outcome. */
export function writeClipboardText(text: string): Promise<ClipboardOutcome> {
  const globals = globalThis as ClipboardGlobals;
  const clipboard = globals.navigator?.clipboard;
  if (clipboard === undefined) {
    return Promise.resolve(globals.isSecureContext === false ? "insecure" : "refused");
  }
  // A rejection is a permission denial or an unfocused document; the outcome carries it, so nothing is lost.
  return clipboard.writeText(text).then(
    (): ClipboardOutcome => "copied",
    (): ClipboardOutcome => "refused",
  );
}
