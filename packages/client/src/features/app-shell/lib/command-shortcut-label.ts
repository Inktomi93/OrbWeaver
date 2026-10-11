// The printed key hint for the command palette. The accelerator accepts Ctrl or Cmd (use-command-shortcut.ts),
// so only the label depends on the platform.

// `Macintosh` covers Mac and iPadOS-as-desktop; `iPhone`/`iPad` cover the rest. Not `Apple`: every Chromium UA carries `AppleWebKit`.
const APPLE_USER_AGENT = /Macintosh|iPhone|iPad/u;

export function commandShortcutLabel(userAgent: string): string {
  return APPLE_USER_AGENT.test(userAgent) ? "⌘K" : "Ctrl+K";
}
