import type { ReactElement } from "react";

export interface AriaAnnouncerProps {
  /** Message announced to screen readers / AX-tree agents. Each change to this string re-announces. */
  readonly message: string;
}

// Visually-hidden aria-live status region for SPA route/section-change announcements. Mounted
// persistently and initially empty — a live region inserted while already containing its text is
// not reliably announced, so never unmount it.
export function AriaAnnouncer({ message }: AriaAnnouncerProps): ReactElement {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
