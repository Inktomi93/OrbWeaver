import type { ReactElement } from "react";

export interface AriaAnnouncerProps {
  /** Message announced to screen readers / AX-tree agents. Each change to this string re-announces. */
  readonly message: string;
}

/**
 * A visually-hidden `aria-live="polite"` status region for SPA route/section-change announcements.
 * This shell keeps the URL at `/`, so there is no native navigation event for a screen reader (or an
 * MCP agent reading the AX tree) to hear — this region IS that signal (AGENT-NAVIGABILITY.md §3).
 *
 * Mounted PERSISTENTLY and initially empty: assistive tech registers a live region when it appears in
 * the DOM, then announces subsequent text mutations. A region inserted while ALREADY containing its
 * text is not reliably announced — so we never unmount it (no early `return null`) and render
 * `message` directly, letting the text change be the thing AT hears.
 */
export function AriaAnnouncer({ message }: AriaAnnouncerProps): ReactElement {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
