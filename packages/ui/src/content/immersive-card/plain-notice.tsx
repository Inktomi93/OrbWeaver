// The one line under a message that says why its rich content is plain, with the
// control that opens the setting that turns it on. The reason is visible text, never a `title=`: a touch reader cannot
// hover. `@orb/ui` does no navigation, so the copy, the control's name and what it does all come from the caller.

import type { ReactElement } from "react";
import { CAPTION } from "#lib";
import { Button } from "#primitives/button";
import { plainNoticeVariants } from "./variants.ts";

export interface PlainNoticeAction {
  /** The control's name, which states where it goes ("Open Charlotte's Trust settings"). */
  readonly label: string;
  readonly onAction: () => void;
}

export interface PlainNoticeProps {
  /** What makes the content plain, stamped as `data-reason`. */
  readonly reason: string;
  /** Where it can be turned on, stamped as `data-remedy`. */
  readonly remedy: string;
  /** The cause and the remedy, in plain words. */
  readonly message: string;
  /** Absent when the viewer cannot change the setting. */
  readonly action?: PlainNoticeAction | undefined;
}

export function PlainNotice({ reason, remedy, message, action }: PlainNoticeProps): ReactElement {
  return (
    <div className={plainNoticeVariants()} data-slot="plain-notice" data-reason={reason} data-remedy={remedy}>
      <p className={CAPTION}>{message}</p>
      {action === undefined ? null : (
        <Button variant="ghost" size="sm" wrap={true} onClick={action.onAction} data-slot="plain-notice-action">
          {action.label}
        </Button>
      )}
    </div>
  );
}
