// The one line under a message that says why its rich content is plain, with the
// control that opens the setting that turns it on. The reason is visible text, never a `title=`: a touch reader cannot
// hover. `@orb/ui` does no navigation, so the copy, the control's name and what it does all come from the caller.

import type { ReactElement } from "react";
import { CAPTION } from "#lib";
import { Button } from "#primitives/button";
import { plainNoticeVariants } from "./variants.ts";

export interface PlainNoticeAction {
  /** Unique among the notice's controls. */
  readonly key: string;
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
  /** One per setting that must change; absent or empty when the viewer cannot change any. */
  readonly actions?: readonly PlainNoticeAction[] | undefined;
}

const NO_ACTIONS: readonly PlainNoticeAction[] = [];

export function PlainNotice({ reason, remedy, message, actions = NO_ACTIONS }: PlainNoticeProps): ReactElement {
  return (
    <div className={plainNoticeVariants()} data-slot="plain-notice" data-reason={reason} data-remedy={remedy}>
      <p className={CAPTION}>{message}</p>
      {actions.map((action) => (
        <Button key={action.key} variant="ghost" size="sm" wrap={true} onClick={action.onAction} data-slot="plain-notice-action">
          {action.label}
        </Button>
      ))}
    </div>
  );
}
